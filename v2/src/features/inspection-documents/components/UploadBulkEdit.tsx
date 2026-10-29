import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';
import { firstDayOfPreviousMonth } from '../lib/aiOcr';
import type { UploadCategory } from '../lib/fileNameExtract';
import type { BulkPatch } from '../lib/uploadRows';
import type { RowOptions } from './UploadRowsTable';

type BulkField = keyof BulkPatch;

const FIELDS: { key: BulkField; label: string }[] = [
  { key: 'category', label: '区分' },
  { key: 'performedOn', label: '実施日' },
  { key: 'propertyCode', label: '物件' },
  { key: 'inspectionType', label: '点検種別' },
  { key: 'note', label: 'メモ' },
  { key: 'managementCompanyId', label: '管理会社' },
  { key: 'vendorId', label: '保守会社' },
];

interface UploadBulkEditProps {
  selectedCount: number;
  options: RowOptions;
  today: string;
  disabled: boolean;
  onApply: (patch: BulkPatch) => void;
}

/**
 * ☑選択行の一括設定（修正依頼1029(1)）。項目ごとに「変更しない」か値を選び、選択中の行にまとめて入れる。
 * 「変更しない」のままの項目は行ごとの値を変えない
 */
export function UploadBulkEdit({ selectedCount, options, today, disabled, onApply }: UploadBulkEditProps) {
  const [values, setValues] = useState<Record<BulkField, string>>({
    category: '',
    performedOn: '',
    propertyCode: '',
    inspectionType: '',
    note: '',
    managementCompanyId: '',
    vendorId: '',
  });
  /** 値を入れる項目（入れていない項目は「変更しない」） */
  const [enabled, setEnabled] = useState<Set<BulkField>>(new Set());
  const set = (key: BulkField, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setEnabled((prev) => new Set(prev).add(key));
  };
  const keep = (key: BulkField) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  const field = 'w-full rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px]';
  const apply = () => {
    const patch: BulkPatch = {};
    for (const k of enabled) (patch as Record<BulkField, string>)[k] = values[k];
    if (patch.category === '') delete patch.category;
    onApply(patch);
  };
  return (
    <section aria-label="選択行に一括設定" className="rounded border-2 border-emerald-500 bg-white p-1.5 text-[11px]" data-testid="upload-bulk-edit">
      <p className="font-semibold text-gray-700">
        選択行に一括設定（{selectedCount}行）
        <span className="ml-1 font-normal text-gray-500">入力した項目だけを選択中の行に上書きします。「変更しない」の項目は行ごとの値を変えません。</span>
      </p>
      <div className="mt-1 grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5">
        {FIELDS.map(({ key, label }) => {
          const on = enabled.has(key);
          return (
            <div key={key} className="contents">
              <span className="text-gray-700">{label}</span>
              <button
                type="button"
                aria-pressed={!on}
                aria-label={`${label}を変更しない`}
                className={cn('h-5 rounded border px-1', !on ? 'border-gray-400 bg-gray-200 text-gray-700' : 'border-gray-300 bg-white text-gray-400 hover:bg-gray-50')}
                onClick={() => keep(key)}
                disabled={disabled}
              >
                変更しない
              </button>
              <div className={cn('flex items-center gap-1', on && 'rounded ring-1 ring-amber-400')}>
                {key === 'category' && (
                  <select aria-label={`一括設定の${label}`} className={field} value={values.category} disabled={disabled} onChange={(e) => set('category', e.target.value as UploadCategory)}>
                    <option value="">選ぶ</option>
                    {options.categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
                {key === 'performedOn' && (
                  <>
                    <input type="date" aria-label={`一括設定の${label}`} className={field} value={values.performedOn} max="9999-12-31" disabled={disabled} onChange={(e) => set('performedOn', e.target.value)} />
                    <button type="button" className="shrink-0 text-blue-700 hover:underline" disabled={disabled} onClick={() => set('performedOn', today)}>
                      今日
                    </button>
                    <button type="button" className="shrink-0 text-blue-700 hover:underline" disabled={disabled} onClick={() => set('performedOn', firstDayOfPreviousMonth(today))}>
                      先月頭
                    </button>
                  </>
                )}
                {key === 'note' && (
                  <input aria-label={`一括設定の${label}`} className={field} value={values.note} maxLength={500} disabled={disabled} onChange={(e) => set('note', e.target.value)} />
                )}
                {(key === 'propertyCode' || key === 'inspectionType' || key === 'managementCompanyId' || key === 'vendorId') && (
                  <div className="min-w-0 flex-1">
                    <Combobox
                      aria-label={`一括設定の${label}`}
                      className="py-0.5 text-[11px]"
                      value={values[key]}
                      options={
                        key === 'propertyCode'
                          ? options.properties
                          : key === 'inspectionType'
                            ? options.inspectionTypesOf(values.propertyCode)
                            : key === 'managementCompanyId'
                              ? options.managementCompanies
                              : options.vendors
                      }
                      placeholder={`🔍 ${label}`}
                      disabled={disabled}
                      onChange={(v) => set(key, v)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-end">
        <Button size="sm" className="h-6 text-[11px]" disabled={disabled || selectedCount === 0 || enabled.size === 0} onClick={apply}>
          選択中の{selectedCount}行に入れる
        </Button>
      </div>
    </section>
  );
}
