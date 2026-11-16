import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { fetchTemplateImages } from '@/lib/api/masterData';
import { deleteVendorOverride, fetchMgmtVendorDefaults, saveVendorOverride } from '@/lib/api/vendor-overrides';
import { effectiveVendorDefaults, overrideAction, type MgmtVendorDefaultRow } from '@/lib/vendorDefaults';
import { templateFileUrl } from '@/lib/templateStorage';
import { safePosterUrl } from '@/lib/posterUrl';
import { normalizeSearch } from '@/lib/utils';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import { templateDisplayName } from '@/features/bulk-entry/utils/rowDetail';
import type { DbTemplateImage } from '@/types/database';
import { buildTemplateOptions } from '../lib/inspectionTypes';
import { MasterToolbar } from './MasterToolbar';

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message ?? '');
  return '';
}

/** 行の識別（保守会社 × 点検種別。種別なしの行は保守会社だけ） */
const rowKey = (r: MgmtVendorDefaultRow) => `${r.vendor_id}:${r.inspection_type_id ?? ''}`;

/**
 * マスター管理の「保守会社」タブ（管理会社ログイン時。修正依頼1115 (5)）。保守会社 × 紐付けた点検種別の行に、
 * 緊急連絡先・点検 TPL（テンプレート名）・小さい貼紙を出す。値は業務システムの設定が既定で、管理会社は自社用に
 * 緊急連絡先（保守会社ごと）と点検 TPL（点検種別ごと。既存のテンプレートから選ぶ）を変えられ、「既定に戻す」で消せる。
 * 変えた値は自社が管理する物件への申請（1件入力・一括入力・点検一覧の申請）の初期値になる（DB の TPL 照合もこの値を許す）
 */
export function VendorDefaultsTable() {
  const { addToast } = useToast();
  const [rows, setRows] = useState<MgmtVendorDefaultRow[] | null>(null);
  const [templates, setTemplates] = useState<DbTemplateImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MgmtVendorDefaultRow | null>(null);
  const [resetting, setResetting] = useState<MgmtVendorDefaultRow | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    void fetchTemplateImages()
      .then(setTemplates)
      .catch((e: unknown) => console.warn('点検テンプレートの取得に失敗しました:', e));
    try {
      setRows(await fetchMgmtVendorDefaults());
    } catch (e) {
      console.error('保守会社の既定の取得に失敗しました:', e);
      setError('保守会社の一覧を読み込めませんでした');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return rows ?? [];
    return (rows ?? []).filter(
      (r) => normalizeSearch(r.vendor_name).includes(q) || normalizeSearch(r.inspection_type_label ?? '').includes(q),
    );
  }, [rows, search]);

  const handleReset = async (r: MgmtVendorDefaultRow) => {
    setBusyKey(rowKey(r));
    try {
      if (r.template_override_id) await deleteVendorOverride(r.template_override_id);
      if (r.contact_override_id) await deleteVendorOverride(r.contact_override_id);
      addToast(`「${r.vendor_name}」を既定に戻しました`, 'success');
      await load();
    } catch (e) {
      console.error('既定に戻せませんでした:', e);
      addToast(`既定に戻せませんでした: ${errorMessage(e)}`, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-2">
      <MasterToolbar
        count={shown.length}
        search={
          <Input placeholder="保守会社名・点検種別で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        }
        action={
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            更新
          </Button>
        }
        note={
          '業務システムの取引先・点検種別の設定が既定です。自社が管理する物件への申請で使う緊急連絡先と点検TPL（貼紙）を、' +
          '保守会社・点検種別ごとに変えられます（変えた値は1件入力・一括入力・点検一覧の申請の初期値になります）。' +
          '緊急連絡先はその保守会社の全部の点検種別に効きます。「既定に戻す」で業務システムの設定に戻ります。' +
          '行は、保守会社に紐付けた点検種別と、自社物件の点検（台ごとの保守を含む）に出てくる保守会社・点検種別です。'
        }
      />
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !rows ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {search ? '検索結果がありません。検索語を変えてください' : '保守会社が登録されていません（業務システムの取引先で「保守会社」を付けると表示されます）'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[46rem] text-left" data-testid="vendor-defaults-table">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="cell-head font-medium text-gray-500">保守会社名</th>
                <th className="cell-head font-medium text-gray-500">点検種別</th>
                <th className="cell-head font-medium text-gray-500">緊急連絡先</th>
                <th className="cell-head font-medium text-gray-500">点検TPL</th>
                <th className="cell-head font-medium text-gray-500">貼紙</th>
                <th className="cell-head font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const eff = effectiveVendorDefaults(r);
                const overridden = eff.contactOverridden || eff.templateOverridden;
                const url = eff.templateNo
                  ? safePosterUrl(resolveTemplateImageUrl(eff.templateNo, templates, templateFileUrl))
                  : null;
                const busy = busyKey === rowKey(r);
                return (
                  <tr key={rowKey(r)} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="cell text-sm text-gray-900">{r.vendor_name}</td>
                    <td className="cell text-sm text-gray-700">
                      {r.inspection_type_id ? (
                        (r.inspection_type_label ?? '（不明な種別）')
                      ) : (
                        <span className="text-xs text-gray-400">点検種別の紐付けなし</span>
                      )}
                    </td>
                    <td className="cell text-sm text-gray-700">
                      {eff.emergencyContact || <span className="text-xs text-gray-400">連絡先未設定</span>}
                      {eff.contactOverridden && <OverrideBadge />}
                    </td>
                    <td className="cell text-sm text-gray-700">
                      {r.inspection_type_id ? (
                        <>
                          {eff.templateNo ? (
                            <span title={eff.templateNo}>
                              {templateDisplayName(eff.templateNo, eff.templateNo, templates)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">未設定</span>
                          )}
                          {eff.templateOverridden && <OverrideBadge />}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">－</span>
                      )}
                    </td>
                    <td className="cell">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" title="貼紙を別のタブで開く">
                          <img
                            src={url}
                            alt={`${r.vendor_name} ${r.inspection_type_label ?? ''}の貼紙`}
                            loading="lazy"
                            className="h-14 w-10 rounded border border-gray-200 bg-white object-contain"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">－</span>
                      )}
                    </td>
                    <td className="cell whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(r)} disabled={busyKey !== null}>
                          編集
                        </Button>
                        {overridden && (
                          <Button size="sm" variant="ghost" onClick={() => setResetting(r)} disabled={busyKey !== null}>
                            {busy ? '戻しています…' : '既定に戻す'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        onConfirm={() => {
          if (resetting) void handleReset(resetting);
        }}
        title="既定に戻す"
        message={resetMessage(resetting)}
        confirmLabel="既定に戻す"
      />
      {editing && (
        <VendorOverrideModal
          row={editing}
          templates={templates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function OverrideBadge() {
  return (
    <span
      className="ml-1 whitespace-nowrap rounded bg-amber-50 px-1 py-0.5 text-[11px] font-medium text-amber-700"
      title="自社の個別設定です"
    >
      個別設定
    </span>
  );
}

function resetMessage(r: MgmtVendorDefaultRow | null): string {
  if (!r) return '';
  const eff = effectiveVendorDefaults(r);
  const parts: string[] = [];
  if (eff.templateOverridden) parts.push(`点検TPL（${r.inspection_type_label ?? ''}）`);
  if (eff.contactOverridden) parts.push('緊急連絡先（この保守会社の全部の点検種別）');
  return `「${r.vendor_name}」の${parts.join('と')}を業務システムの設定に戻します。`;
}

interface VendorOverrideModalProps {
  row: MgmtVendorDefaultRow;
  templates: DbTemplateImage[];
  onClose: () => void;
  onSaved: () => void;
}

/** 個別設定の編集（緊急連絡先は文字、点検 TPL はテンプレートの一覧からプレビュー付きで選ぶ。空・既定と同じなら既定に戻す） */
function VendorOverrideModal({ row, templates, onClose, onSaved }: VendorOverrideModalProps) {
  const { addToast } = useToast();
  const eff = effectiveVendorDefaults(row);
  const groups = useMemo(() => buildTemplateOptions(templates), [templates]);
  const allKeys = useMemo(() => groups.flatMap((g) => g.options.map((o) => o.value)), [groups]);
  const [contact, setContact] = useState(eff.contactOverridden ? eff.emergencyContact : '');
  const [templateNo, setTemplateNo] = useState(eff.templateOverridden ? eff.templateNo : '');
  const [saving, setSaving] = useState(false);
  const dirty =
    contact !== (eff.contactOverridden ? eff.emergencyContact : '') ||
    templateNo !== (eff.templateOverridden ? eff.templateNo : '');
  const shownTemplate = templateNo || row.default_template_no || '';
  const previewUrl = shownTemplate
    ? safePosterUrl(resolveTemplateImageUrl(shownTemplate, templates, templateFileUrl))
    : null;
  const defaultName = row.default_template_no
    ? templateDisplayName(row.default_template_no, row.default_template_no, templates)
    : '未設定';

  const handleSave = async () => {
    const contactAct = overrideAction(contact, row.default_emergency_contact, row.contact_override_id ? row.emergency_contact : null);
    const templateAct = row.inspection_type_id
      ? overrideAction(templateNo, row.default_template_no, row.template_override_id ? row.template_no : null)
      : ({ kind: 'keep' } as const);
    if (contactAct.kind === 'set' && contactAct.value.length > 50) {
      addToast('緊急連絡先は50文字以内にしてください', 'error');
      return;
    }
    setSaving(true);
    try {
      if (contactAct.kind === 'set') {
        await saveVendorOverride(row.contact_override_id, {
          kind: 'contact',
          vendorId: row.vendor_id,
          emergencyContact: contactAct.value,
        });
      } else if (contactAct.kind === 'clear' && row.contact_override_id) {
        await deleteVendorOverride(row.contact_override_id);
      }
      if (templateAct.kind === 'set' && row.inspection_type_id) {
        await saveVendorOverride(row.template_override_id, {
          kind: 'template',
          vendorId: row.vendor_id,
          inspectionTypeId: row.inspection_type_id,
          templateNo: templateAct.value,
        });
      } else if (templateAct.kind === 'clear' && row.template_override_id) {
        await deleteVendorOverride(row.template_override_id);
      }
      addToast('保存しました', 'success');
      onSaved();
    } catch (e) {
      console.error('個別設定の保存に失敗しました:', e);
      addToast(`保存に失敗しました: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      title={`個別設定（${row.vendor_name}${row.inspection_type_label ? ` × ${row.inspection_type_label}` : ''}）`}
      className="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="min-w-0 space-y-2">
          <div className="space-y-0.5">
            <Input
              id="vendor-override-contact"
              label="緊急連絡先"
              value={contact}
              maxLength={50}
              placeholder={row.default_emergency_contact ? `既定: ${row.default_emergency_contact}` : '既定: 未設定'}
              onChange={(e) => setContact(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              {`空にすると既定（業務システムの取引先: ${row.default_emergency_contact || '未設定'}）に戻ります。この保守会社の全部の点検種別の申請に効きます`}
            </p>
          </div>
          {row.inspection_type_id ? (
            <div className="space-y-0.5">
              <label htmlFor="vendor-override-template" className="block text-xs font-medium text-gray-600">
                点検TPL（貼紙）
              </label>
              <select
                id="vendor-override-template"
                className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={templateNo}
                onChange={(e) => setTemplateNo(e.target.value)}
              >
                <option value="">既定（{defaultName}）</option>
                {templateNo && !allKeys.includes(templateNo) && <option value={templateNo}>{templateNo}</option>}
                {groups.map((g) =>
                  g.label ? (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    g.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))
                  ),
                )}
              </select>
              <p className="text-xs text-gray-500">
                「{row.inspection_type_label}」の申請で使う貼紙です。既定は点検種別の設定（業務システム）です
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              この保守会社には点検種別の紐付けが無いため、点検TPLは変えられません（緊急連絡先だけ変えられます）
            </p>
          )}
        </div>
        <div className="flex min-h-24 items-center justify-center self-start rounded-lg bg-slate-50 p-2 text-sm">
          {previewUrl ? (
            <img src={previewUrl} alt="貼紙のプレビュー" className="max-h-[280px] max-w-full rounded" />
          ) : (
            <span className="text-slate-400">{row.inspection_type_id ? 'プレビュー' : '－'}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
