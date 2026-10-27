import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { DbInspectionType, DbVendor } from '@/types/database';
import type { PropertyInspection } from '@/types/app';
import { MonthCheckboxes } from './MonthCheckboxes';
import { sortVendors } from '@/lib/vendorOptions';
import { formatInspectedOn } from '@/features/bulk-entry/utils/scheduleRows';
import {
  billingMonthsLabel,
  DEFAULT_INTERVAL_MONTHS,
  defaultNotifyFor,
  parseIntervalMonths,
} from '@/lib/inspectionSchedule';

interface PropertyInspectionEditorProps {
  value: PropertyInspection[];
  onChange: (rows: PropertyInspection[]) => void;
  inspectionTypes: DbInspectionType[];
  /** 設備種類の選択肢から外す点検種別（台ごとに管理している種別。ここから足しても業務システムが断る） */
  excludedTypeIds: Set<string>;
  vendors: DbVendor[];
  onError: (message: string) => void;
  /**
   * 「追加」「更新」をまだ押していない入力があるか（変わるたびに呼ぶ）。
   * 物件の「保存」は表の行だけを送るので、呼ぶ側はこれで保存を止め、閉じる前の破棄確認にも使う
   */
  onDraftChange?: (pending: boolean) => void;
}

interface RowForm {
  inspection_type_id: string;
  vendor_id: string;
  inspection_months: number[];
  remarks: string;
  remarks2: string;
  /** 検査月の入力欄の値（YYYY-MM。空は未登録） */
  inspected_on: string;
  /** 点検日連絡。null は「触っていない」（追加は種別の名前で決める既定、編集は元の行の値） */
  notify: boolean | null;
  /** インターバルの入力欄の値（か月。空は未入力） */
  interval: string;
  billing_months: number[];
  /** 編集中の行の3項目が読めていない（入力欄を止め、保存で送らない） */
  scheduleUnread: boolean;
}

const EMPTY_FORM: RowForm = {
  inspection_type_id: '',
  vendor_id: '',
  inspection_months: [],
  remarks: '',
  remarks2: '',
  inspected_on: '',
  notify: null,
  interval: String(DEFAULT_INTERVAL_MONTHS),
  billing_months: [],
  scheduleUnread: false,
};
const UNREAD_TITLE = '点検日連絡・インターバル・請求月を読み込めなかったため、ここでは変更できません（業務システムで変更してください）';

/** 入力欄に表へ入れていない値があるか（編集中の行、または何か1つでも入れた追加欄） */
function hasPendingRow(form: RowForm, editingIndex: number | null): boolean {
  return (
    editingIndex !== null ||
    !!form.inspection_type_id ||
    !!form.vendor_id ||
    form.inspection_months.length > 0 ||
    !!form.remarks ||
    !!form.remarks2 ||
    !!form.inspected_on ||
    form.notify !== null ||
    form.interval !== String(DEFAULT_INTERVAL_MONTHS) ||
    form.billing_months.length > 0
  );
}

const selectClass = 'block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';
// ラベルは Input / Select の部品と同じ見た目にそろえる
const labelClass = 'block text-xs font-medium text-gray-600';

/**
 * 設備情報（物件×点検種別）。一覧はローカルで編集し、物件の「保存」でまとめて業務システムへ送る。
 * 既存の行は「編集」でフォームへ読み込んで更新できる（0913 依頼③）。
 */
// v1: js/admin-masters.js populatePropertyEquipmentSelects / renderPropertyEquipment / addPropertyEquipmentRow / startEditPropertyEquipment
export function PropertyInspectionEditor({
  value,
  onChange,
  inspectionTypes,
  excludedTypeIds,
  vendors,
  onError,
  onDraftChange,
}: PropertyInspectionEditorProps) {
  const [form, setForm] = useState<RowForm>(EMPTY_FORM);
  // 編集中の行の位置。null なら「追加」
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const pending = hasPendingRow(form, editingIndex);

  useEffect(() => {
    onDraftChange?.(pending);
  }, [pending, onDraftChange]);

  // 設備種類は「点検」カテゴリの点検種別だけ
  const typeOptions = inspectionTypes.filter(
    (t) => t.category === '点検' && !excludedTypeIds.has(t.id),
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingIndex(null);
  };

  const startEdit = (index: number) => {
    const row = value[index];
    if (!row) return;
    setEditingIndex(index);
    setForm({
      // 選択肢に無い種別（「点検」以外のカテゴリ等）は空にする。v1 は select に無い値を入れると空になり、
      // 「設備種類を選択してください」で更新を止める。値を残すと画面は「選択...」のまま元の種別で保存される
      inspection_type_id: typeOptions.some((t) => t.id === row.inspection_type_id)
        ? row.inspection_type_id
        : '',
      vendor_id: row.vendor_id ?? '',
      inspection_months: Array.isArray(row.inspection_months) ? row.inspection_months.map(Number) : [],
      remarks: row.remarks ?? '',
      remarks2: row.remarks2 ?? '',
      inspected_on: row.inspected_on ? String(row.inspected_on).slice(0, 7) : '',
      notify: row.notify_inspection_date ?? null,
      interval: row.interval_months == null ? '' : String(row.interval_months),
      billing_months: Array.isArray(row.billing_months) ? row.billing_months.map(Number) : [],
      scheduleUnread: row.notify_inspection_date === undefined,
    });
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    // 編集中の行を消したらフォームも戻す。残すと存在しない行を更新しにいく
    if (editingIndex === index) resetForm();
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
  };

  const submitRow = () => {
    if (!form.inspection_type_id) {
      onError('設備種類を選択してください');
      return;
    }
    // 同じ点検種別を二重に登録させない（業務システム側も unique 制約で弾く）
    if (value.some((e, i) => e.inspection_type_id === form.inspection_type_id && i !== editingIndex)) {
      onError('この設備種類は既に登録されています');
      return;
    }
    // 編集した行は新しい値で置き換える（保守会社用の設備コードは保存時に業務システムの今の値を引き継ぐ）
    // 検査月は月初の日付で持つ（DB と同じ形）。空欄のままで、元の行の検査月が読めていない（undefined）ときは undefined のまま
    // （保存で送らない。空欄を「消す」にすると、読めなかっただけの値を消してしまう）
    const previous = editingIndex !== null ? value[editingIndex]?.inspected_on : null;
    const interval = parseIntervalMonths(form.interval);
    if (interval.error) {
      onError(interval.error);
      return;
    }
    // 点検日連絡・インターバル・請求月（修正依頼1027(7)）。編集中の行で読めていなければ持たない（保存で送らない）
    const schedule = form.scheduleUnread
      ? {}
      : {
          notify_inspection_date: form.notify ?? defaultNotifyFor(typeName(form.inspection_type_id)),
          interval_months: interval.value,
          billing_months: form.billing_months,
        };
    const row: PropertyInspection = {
      ...schedule,
      inspection_type_id: form.inspection_type_id,
      vendor_id: form.vendor_id || null,
      inspection_months: form.inspection_months,
      remarks: form.remarks,
      remarks2: form.remarks2,
      inspected_on: form.inspected_on ? `${form.inspected_on}-01` : previous === undefined ? undefined : null,
    };
    onChange(
      editingIndex !== null ? value.map((r, i) => (i === editingIndex ? row : r)) : [...value, row],
    );
    resetForm();
  };

  const typeName = (id: string) => inspectionTypes.find((t) => t.id === id)?.inspection_name || '-';
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.vendor_name || '-';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left whitespace-nowrap">
              <th className="cell-head font-medium text-gray-700">設備種類</th>
              <th className="cell-head font-medium text-gray-700">保守会社</th>
              <th className="cell-head font-medium text-gray-700">点検月</th>
              <th className="cell-head font-medium text-gray-700">検査月</th>
              <th className="cell-head font-medium text-gray-700">備考</th>
              <th className="cell-head font-medium text-gray-700">備考2</th>
              <th className="cell-head font-medium text-gray-700 w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-500">
                  設備が登録されていません
                </td>
              </tr>
            ) : (
              value.map((row, index) => (
                <tr
                  key={row.inspection_type_id || index}
                  className={cn('border-b border-gray-100', index === editingIndex && 'bg-amber-50')}
                >
                  <td className="cell">
                    {typeName(row.inspection_type_id)}
                    {row.notify_inspection_date === false && (
                      <div className="text-[11px] text-amber-700">点検日連絡なし（報告書のみ）</div>
                    )}
                  </td>
                  <td className="cell">{vendorName(row.vendor_id)}</td>
                  <td className="cell">
                    {row.inspection_months.length
                      ? row.inspection_months.map((m) => `${m}月`).join(', ')
                      : '-'}
                    {row.billing_months !== undefined && (
                      <div className="text-[11px] text-gray-500">請求月: {billingMonthsLabel(row.billing_months)}</div>
                    )}
                  </td>
                  <td className="cell whitespace-nowrap tabular-nums">
                    {formatInspectedOn(row.inspected_on)}
                    {row.interval_months != null && (
                      <div className="text-[11px] text-gray-500">インターバル {row.interval_months}か月</div>
                    )}
                  </td>
                  <td className="cell">{row.remarks}</td>
                  <td className="cell">{row.remarks2}</td>
                  <td className="cell">
                    <div className="-my-0.5 flex gap-1">
                      <Button variant="secondary" size="sm" type="button" onClick={() => startEdit(index)}>
                        編集
                      </Button>
                      <Button variant="danger" size="sm" type="button" onClick={() => removeRow(index)}>
                        削除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">
          {editingIndex !== null ? '設備を更新' : '設備を追加'}
        </h4>
        {/* FHD（2xl）では設備種類・保守会社・点検月を1行に並べる（それより狭いときは点検月が次の行） */}
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 2xl:grid-cols-4">
          <div className="space-y-0.5">
            <label htmlFor="prop-equipment-type" className={labelClass}>
              設備種類
            </label>
            <select
              id="prop-equipment-type"
              className={selectClass}
              value={form.inspection_type_id}
              onChange={(e) => setForm({ ...form, inspection_type_id: e.target.value })}
            >
              <option value="">選択...</option>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.inspection_name}
                </option>
              ))}
            </select>
            <label
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-700"
              title={form.scheduleUnread ? UNREAD_TITLE : '設備点検管理システムで点検日を連絡（申請）する点検か。外すと申請不要（報告書のみ）。リモート点検・警備は既定で外れます'}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={form.notify ?? defaultNotifyFor(typeName(form.inspection_type_id))}
                disabled={form.scheduleUnread}
                onChange={(e) => setForm({ ...form, notify: e.target.checked })}
              />
              点検日連絡
            </label>
          </div>
          <div className="space-y-0.5">
            <label htmlFor="prop-equipment-vendor" className={labelClass}>
              保守会社
            </label>
            <select
              id="prop-equipment-vendor"
              className={selectClass}
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
            >
              <option value="">なし</option>
              {sortVendors(vendors).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5 sm:col-span-2">
            <span className={labelClass}>点検月</span>
            <MonthCheckboxes
              value={form.inspection_months}
              onChange={(months) => setForm({ ...form, inspection_months: months })}
              suffix="月"
            />
            <span className={labelClass}>
              請求月 <span className="font-normal text-gray-400">空は毎月</span>
            </span>
            <fieldset disabled={form.scheduleUnread} title={form.scheduleUnread ? UNREAD_TITLE : undefined}>
              <MonthCheckboxes
                label="請求月"
                value={form.billing_months}
                onChange={(months) => setForm({ ...form, billing_months: months })}
                suffix="月"
              />
            </fieldset>
          </div>
        </div>
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
          <div className="space-y-0.5">
            <label htmlFor="prop-equipment-inspected-on" className={labelClass}>
              検査月（直近の実施）
            </label>
            <input
              type="month"
              id="prop-equipment-inspected-on"
              className={selectClass}
              value={form.inspected_on}
              onChange={(e) => setForm({ ...form, inspected_on: e.target.value })}
            />
            <label className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gray-600">
              インターバル
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                aria-label="インターバル（か月）"
                className="w-14 rounded-md border border-gray-300 px-1 py-0.5 text-right text-sm"
                placeholder={String(DEFAULT_INTERVAL_MONTHS)}
                value={form.interval}
                disabled={form.scheduleUnread}
                title={form.scheduleUnread ? UNREAD_TITLE : undefined}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
              />
              か月
            </label>
          </div>
          <Input
            label="備考"
            id="prop-equipment-remarks"
            placeholder="2基など"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
          <Input
            label="備考2"
            id="prop-equipment-remarks2"
            value={form.remarks2}
            onChange={(e) => setForm({ ...form, remarks2: e.target.value })}
          />
          <div className="flex gap-2">
            <Button size="sm" type="button" onClick={submitRow}>
              {editingIndex !== null ? '更新' : '追加'}
            </Button>
            {/* 入れかけの値を表に入れずに消す（追加欄でも出す。残っていると物件の保存が止まるため） */}
            {pending && (
              <Button variant="secondary" size="sm" type="button" onClick={resetForm}>
                取消
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
