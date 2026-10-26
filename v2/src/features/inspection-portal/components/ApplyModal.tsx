import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMasterData } from '@/hooks/useMasterData';
import { normalizeTerminalId } from '@/lib/terminal';
import { insertEntries } from '@/lib/api/single-entry';
import { templateFileUrl } from '@/lib/templateStorage';
import { safePosterUrl } from '@/lib/posterUrl';
import { useAppSettings } from '@/features/single-entry/hooks/useAppSettings';
import { noticeUsage, remarksUsage } from '@/features/single-entry/lib/entryLogic';
import { REMARKS_PLACEHOLDER, remarksNotice } from '@/lib/remarks';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import type { AppSettings } from '@/lib/api/single-entry';
import type { MasterData } from '@/types/app';
import type { PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import {
  buildApplyRow,
  findInspectionType,
  initialApplyValues,
  startOutsideTargetMonth,
  terminalOptions,
  toResubmitPatch,
  valuesFromDbEntry,
  withEndDate,
  withStartDate,
  type ApplyContext,
  type ApplyValues,
} from '../lib/applyForm';
import { fetchEntryForEdit, resubmitEntry } from '../lib/entryApi';
import { formatMonth, monthOf, todayJst } from '../lib/schedule';

/** 申請を開く対象（点検一覧の1行） */
export interface ApplyTarget {
  inspection: PortalInspectionRow;
  /** 対象月（YYYY-MM-01）。点検月の無い点検行から開いたときは null（モーダルで選ぶ） */
  targetMonth: string | null;
  /** 差戻された申請を直して再申請するとき、その申請 */
  resubmit: PortalEntryRow | null;
}

interface ApplyModalProps {
  target: ApplyTarget | null;
  onClose: () => void;
  onApplied: () => void;
  userId: string | null;
  isAdmin: boolean;
  /** 保守会社のアカウントの会社（管理者は null） */
  profileVendorId: string | null;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message ?? '');
  return '';
}

/**
 * 点検の申請（保守会社・管理者）。マスタ（端末・案内文の既定文・テンプレート画像）と設定は、
 * 一覧を開いたときに1回だけ読む（開くたびに読まないよう、モーダルの外枠は出したままにする）
 */
export function ApplyModal({ target, onClose, onApplied, userId, isAdmin, profileVendorId }: ApplyModalProps) {
  const master = useMasterData();
  const settings = useAppSettings();
  const ready = !master.loading && !!settings;
  const title = target?.resubmit ? '差戻しの修正・再申請' : '点検の申請';
  // 入力を変えたら、背景クリック・Escape で閉じる前に破棄の確認を出す
  const [dirty, setDirty] = useState(false);
  const close = () => {
    setDirty(false);
    onClose();
  };

  return (
    <Modal open={!!target} onClose={close} title={title} className="max-w-2xl" dirty={dirty}>
      {target && !ready && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {target && ready && master.error && <p className="text-sm text-red-600">マスターデータの読み込みに失敗しました</p>}
      {target && ready && !master.error && (
        <ApplyForm
          key={`${target.inspection.inspection_id}:${target.targetMonth}:${target.resubmit?.id ?? ''}`}
          target={target}
          master={master}
          settings={settings}
          userId={userId}
          isAdmin={isAdmin}
          profileVendorId={profileVendorId}
          onClose={close}
          onApplied={onApplied}
          onDirty={() => setDirty(true)}
        />
      )}
    </Modal>
  );
}

interface ApplyFormProps extends Omit<ApplyModalProps, 'target'> {
  target: ApplyTarget;
  master: MasterData;
  settings: AppSettings;
  onDirty: () => void;
}

function ApplyForm({
  target,
  master,
  settings,
  userId,
  isAdmin,
  profileVendorId,
  onClose,
  onApplied,
  onDirty,
}: ApplyFormProps) {
  const { addToast } = useToast();
  const { inspection, resubmit } = target;
  const today = todayJst();

  const ctx: ApplyContext = useMemo(() => {
    const property = master.properties.find((p) => p.property_code === inspection.property_code) ?? null;
    // 受注先は点検行の保守会社（1件入力の vendors[0] 方式は使わない）。保守会社のアカウントは自社に固定
    // （台ごとの保守で別の会社が担当する点検もあり、DB も自社以外の vendor_id を受け付けない）
    const vendorId = isAdmin ? inspection.vendor_id : profileVendorId;
    const fromMaster = master.vendors.find((v) => v.id === vendorId);
    const vendor = fromMaster
      ? fromMaster
      : vendorId && vendorId === inspection.vendor_id
        ? { id: vendorId, vendor_name: inspection.vendor_name ?? '', emergency_contact: '' }
        : null;
    return {
      inspection,
      property,
      inspectionType: findInspectionType(master.inspectionTypes, inspection),
      vendor,
      hasTemplateImage: (key) => resolveTemplateImageUrl(key, master.templateImages, templateFileUrl) !== null,
      settings,
    };
  }, [master, inspection, settings, isAdmin, profileVendorId]);

  const defaultMonth = target.targetMonth ?? monthOf(today);
  const [values, setValues] = useState<ApplyValues>(() => {
    const initial = initialApplyValues(defaultMonth, ctx);
    // 物件マスタで引けない点検物件は RPC の端末 ID の先頭
    return ctx.property ? initial : { ...initial, terminalId: normalizeTerminalId(inspection.terminal_ids[0] ?? '') };
  });
  const [loadingEntry, setLoadingEntry] = useState(!!resubmit);
  // 再申請では保守会社名を書き換えない（toResubmitPatch）ので、表示も元の申請の保守会社名にする
  const [existingVendorName, setExistingVendorName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 他の方が作った差戻しは直せない（RLS）ので、新しい申請として出す
  const canEditExisting = !!resubmit && (resubmit.is_mine || isAdmin);
  // 追加貼紙（1件入力・一括入力で画像を付けた申請）の差戻し。このモーダルは貼紙を選べないので、貼紙は元の追加画像のまま出す
  const customPoster = resubmit?.poster_type === 'custom' ? resubmit : null;
  const customPosterUrl = safePosterUrl(customPoster?.poster_image);

  useEffect(() => {
    if (!resubmit || !canEditExisting) return;
    let cancelled = false;
    fetchEntryForEdit(resubmit.id)
      .then((row) => {
        if (cancelled) return;
        setValues(valuesFromDbEntry(row, defaultMonth));
        setExistingVendorName(row.vendor_name ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) addToast(`申請を読み込めませんでした: ${errorMessage(err)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingEntry(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resubmit, canEditExisting, defaultMonth, addToast]);

  const update = (next: ApplyValues) => {
    setValues(next);
    onDirty();
  };

  // 物件マスタで引けない（保守会社の担当物件表に無い）点検物件は、RPC が返す端末 ID を使う
  const terminals = ctx.property ? terminalOptions(ctx.property) : inspection.terminal_ids.map(normalizeTerminalId).filter(Boolean);
  const notice = noticeUsage(values.noticeText, settings);
  const remarks = remarksUsage(values.remarks, settings);
  // 目安を超えたら欄の下に注意（申請は止めない。1件入力・一括入力と同じ。修正依頼1026 I8）
  const remarksWarning = remarksNotice(values.remarks, settings.remarks_chars_per_line, settings.remarks_max_lines);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!userId) {
      addToast('ログインが必要です', 'error');
      return;
    }
    // 追加貼紙はテンプレート画像を使わないので、テンプレート画像の有無では止めない
    const result = buildApplyRow(values, customPoster ? { ...ctx, hasTemplateImage: () => true } : ctx, userId, today);
    if (!result.ok) {
      addToast(result.message, 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (resubmit && canEditExisting) {
        // 直せる欄だけを書き換える（貼紙・保守会社などは元の申請のまま）
        await resubmitEntry(
          resubmit.id,
          toResubmitPatch(result.row, { terminal: terminals.length > 1, targetMonth: !target.targetMonth }),
        );
        addToast('再申請しました', 'success');
      } else {
        // 他の方の追加貼紙の差戻しを新しい申請として出すときも、貼紙は元の追加画像を使う
        await insertEntries([
          customPoster
            ? {
                ...result.row,
                poster_type: 'custom',
                poster_image: customPoster.poster_image,
                template_no: customPoster.template_no ?? '',
                inspection_type: customPoster.inspection_type,
              }
            : result.row,
        ]);
        addToast('申請しました', 'success');
      }
      onApplied();
      onClose();
    } catch (err) {
      console.error('Apply failed:', err);
      addToast(`申請に失敗しました: ${errorMessage(err)}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEntry && canEditExisting) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-0.5 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs">
        <dt className="text-gray-500">物件</dt>
        <dd>
          {inspection.property_name} <span className="text-gray-500">{inspection.property_code}</span>
        </dd>
        <dt className="text-gray-500">点検種別</dt>
        <dd>{inspection.inspection_type_label ?? '（未設定）'}</dd>
        <dt className="text-gray-500">保守会社</dt>
        <dd>{(existingVendorName ?? ctx.vendor?.vendor_name) || <span className="text-red-600">未設定</span>}</dd>
        {customPoster ? (
          <>
            <dt className="text-gray-500">貼紙</dt>
            <dd>
              追加画像（貼紙は変わりません）
              {customPosterUrl ? (
                <a href={customPosterUrl} target="_blank" rel="noopener noreferrer" title="別のタブで開く" className="mt-0.5 block">
                  <img
                    src={customPosterUrl}
                    alt="追加画像"
                    className="max-h-32 max-w-[12rem] rounded border border-gray-200 object-contain"
                  />
                </a>
              ) : (
                <span className="ml-1 text-gray-500">（画像を表示できません）</span>
              )}
            </dd>
          </>
        ) : (
          <>
            <dt className="text-gray-500">テンプレートNo</dt>
            <dd>{inspection.template_no || ctx.inspectionType?.template_no || '－'}</dd>
          </>
        )}
        {target.targetMonth && (
          <>
            <dt className="text-gray-500">対象月</dt>
            <dd>{formatMonth(target.targetMonth)}</dd>
          </>
        )}
      </dl>

      {resubmit?.review_comment && (
        <div role="note" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          <span className="font-medium">差戻し理由: </span>
          <span className="whitespace-pre-line">{resubmit.review_comment}</span>
        </div>
      )}
      {resubmit && !canEditExisting && (
        <p className="text-xs text-amber-700">ほかの方が作成した申請のため、新しい申請として出します。</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!target.targetMonth && (
          <Input
            label="対象月 *"
            type="month"
            value={values.targetMonth.slice(0, 7)}
            onChange={(e) => update({ ...values, targetMonth: e.target.value ? `${e.target.value}-01` : '' })}
          />
        )}
        <Input
          label="点検開始日 *"
          type="date"
          data-autofocus
          value={values.startDate}
          onChange={(e) => update(withStartDate(values, e.target.value))}
        />
        <Input
          label="点検終了日"
          type="date"
          value={values.endDate}
          onChange={(e) => update(withEndDate(values, e.target.value))}
        />
        {terminals.length > 1 && (
          <Select
            label="端末"
            value={values.terminalId}
            options={terminals.map((t) => ({ value: t, label: t }))}
            onChange={(e) => update({ ...values, terminalId: e.target.value })}
          />
        )}
      </div>
      {startOutsideTargetMonth(values) && (
        <p className="text-xs text-amber-700">点検開始日が対象月（{formatMonth(values.targetMonth)}）の外です。このままでも申請できます。</p>
      )}
      {terminals.length === 1 && <p className="text-xs text-gray-500">端末: {terminals[0]}</p>}
      {terminals.length === 0 && (
        <p className="text-xs text-gray-500">
          端末が無い物件です。端末を指定せずに申請できます。
        </p>
      )}

      <div>
        <TextArea
          label="案内文"
          rows={3}
          value={values.noticeText}
          onChange={(e) => update({ ...values, noticeText: e.target.value })}
        />
        <p className={notice.over ? 'text-xs text-red-600' : 'text-xs text-gray-400'}>
          {notice.chars}/{notice.max}文字
        </p>
      </div>
      <div>
        <TextArea
          label="掲示備考（作業時間など）"
          rows={2}
          placeholder={REMARKS_PLACEHOLDER}
          value={values.remarks}
          onChange={(e) => update({ ...values, remarks: e.target.value })}
        />
        <div className="flex items-start justify-between gap-2 text-xs">
          <span className="text-amber-700" data-testid="remarks-warning">
            {remarksWarning}
          </span>
          <span className={remarks.over ? 'shrink-0 font-medium text-amber-700' : 'shrink-0 text-gray-400'}>
            {remarks.lines}/{remarks.maxLines}行・1行最長 {remarks.longest}/{remarks.perLine}字
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input
          label="表示開始日"
          type="date"
          value={values.displayStartDate}
          onChange={(e) => update({ ...values, displayStartDate: e.target.value })}
        />
        <Input
          label="表示終了日"
          type="date"
          value={values.displayEndDate}
          onChange={(e) => update({ ...values, displayEndDate: e.target.value })}
        />
      </div>
      <p className="text-xs text-gray-400">表示日は点検日に合わせて入ります（空なら点検日を使います）。</p>

      <div className="flex justify-end gap-2 border-t border-gray-200 pt-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '送信中…' : canEditExisting ? '再申請する' : '申請する'}
        </Button>
      </div>
    </div>
  );
}
