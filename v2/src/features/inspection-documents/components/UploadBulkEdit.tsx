import { useEffect, useRef, useState } from 'react';
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
  { key: 'targetMonth', label: '対象月' },
  { key: 'propertyCode', label: '物件' },
  { key: 'inspectionType', label: '点検種別' },
  { key: 'note', label: 'メモ' },
  { key: 'managementCompanyId', label: '管理会社' },
  { key: 'vendorId', label: '保守会社' },
];

interface UploadBulkEditProps {
  /** ポップアップを開いているか（閉じても部品は残し、入れた値は次に開いたときもそのまま。修正依頼1104 E7） */
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  options: RowOptions;
  today: string;
  disabled: boolean;
  onApply: (patch: BulkPatch) => void;
}

/**
 * ☑選択行の一括設定（修正依頼1029(1)）。項目ごとに「変更しない」か値を選び、選択中の行にまとめて入れる。
 * 「変更しない」のままの項目は行ごとの値を変えない。
 * 修正依頼1104 E7: 普段は閉じておき、表の上のボタンで幅 26rem の1列のポップアップとして開く。閉じても部品は残し（hidden）、
 * 入れた値は次に開いたときもそのまま。Escape・外のクリックはポップアップだけを閉じる（アップロードの画面は閉じない）。
 * 修正依頼1104 E5: 対象月を足した（報告書の対象月。空なら実施日の月のまま）
 */
export function UploadBulkEdit({ open, onClose, selectedCount, options, today, disabled, onApply }: UploadBulkEditProps) {
  const [values, setValues] = useState<Record<BulkField, string>>({
    category: '',
    performedOn: '',
    targetMonth: '',
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
  // 「変更しない」に戻したら入れていた値の表示も消す（流れる値が無いのに、前に選んだ値が見えたままにしない）
  const keep = (key: BulkField) => {
    setValues((prev) => ({ ...prev, [key]: '' }));
    setEnabled((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };
  const rootRef = useRef<HTMLElement>(null);
  // 親の描き直しのたびに onClose が新しくなるので ref で読む（effect を張り直してフォーカスを奪わない）
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // 開いたときだけポップアップにフォーカスを移す（Escape をここで受ける）。外を押したら閉じる
  useEffect(() => {
    if (!open) return;
    rootRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t)) return;
      // 開くボタン（トグル）と、候補の一覧は除く
      if (t instanceof Element && (t.closest('[data-testid="upload-bulk-open"]') || t.closest('[role="listbox"]'))) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const field = 'w-full rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px]';
  const apply = () => {
    const patch: BulkPatch = {};
    for (const k of enabled) (patch as Record<BulkField, string>)[k] = values[k];
    if (patch.category === '') delete patch.category;
    onApply(patch);
  };
  return (
    <section
      ref={rootRef}
      id="upload-bulk-edit"
      role="dialog"
      aria-label="選択行に一括設定"
      tabIndex={-1}
      hidden={!open}
      // 右の列がポップアップ（26rem）より狭いときは、右端に揃えて画面の外へ出さない（親の @container）
      className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded border-2 border-emerald-500 bg-white p-1.5 text-[11px] shadow-lg focus:outline-none @max-[26rem]:left-auto @max-[26rem]:right-0"
      data-testid="upload-bulk-edit"
      onKeyDown={(e) => {
        // 候補の一覧などが先に Escape を使ったときは閉じない。ここで使ったら preventDefault で、アップロードの画面（dialog の cancel）を閉じない
        if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="flex items-start gap-1">
        <p className="flex-1 font-semibold text-gray-700">
          選択行に一括設定（{selectedCount}行）
          <span className="block font-normal text-gray-500">入力した項目だけを選択中の行に上書きします。「変更しない」の項目は行ごとの値を変えません。登録済みの行には入れません。</span>
        </p>
        <button type="button" className="shrink-0 rounded border border-gray-300 px-1 text-gray-600 hover:bg-gray-50" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="mt-1 grid grid-cols-1 gap-y-0.5">
        {FIELDS.map(({ key, label }) => {
          const on = enabled.has(key);
          return (
            <div key={key} className="grid grid-cols-[3.5rem_4.5rem_minmax(0,1fr)] items-center gap-x-1">
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
                {key === 'targetMonth' && (
                  <input
                    type="month"
                    aria-label={`一括設定の${label}`}
                    title="報告書の対象月（空なら実施日の月）"
                    className={field}
                    value={values.targetMonth}
                    disabled={disabled}
                    onChange={(e) => set('targetMonth', e.target.value)}
                  />
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
