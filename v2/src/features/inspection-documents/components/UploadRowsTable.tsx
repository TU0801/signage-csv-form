import { Fragment, useState } from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { formatMonth } from '@/features/inspection-portal/lib/schedule';
import { firstDayOfPreviousMonth } from '../lib/aiOcr';
import type { UploadCategory } from '../lib/fileNameExtract';
import {
  FIELD_SOURCE_LABEL,
  rowPageLabel,
  type RowCheck,
  type RowField,
  type RowInput,
  type RowState,
  type UploadRow,
  type UploadSource,
} from '../lib/uploadRows';
import { formatBytes } from '../lib/documents';
import { buildReportFileName } from '../lib/fileName';
import { buildPropertyFileName, propertyFileCategoryLabel } from '../lib/propertyFiles';
import { colorOf } from './UploadPagesPane';

export type RowResult =
  | { state: 'running' }
  | { state: 'ok'; fileName: string }
  /** 同じ点検に同じ内容（SHA-256 が同じ）の報告書が提出済みなので送らなかった。otherMonth はその版が別の対象月のとき */
  | { state: 'skipped'; otherMonth: string | null }
  | { state: 'error'; message: string };

export const isRowFinished = (r: RowResult | undefined) => r?.state === 'ok' || r?.state === 'skipped';

export interface RowOptions {
  properties: ComboboxOption[];
  /** 物件ごとの点検種別（物件が未選択なら全部） */
  inspectionTypesOf: (propertyCode: string) => ComboboxOption[];
  managementCompanies: ComboboxOption[];
  vendors: ComboboxOption[];
  categories: { value: UploadCategory; label: string }[];
}

interface UploadRowsTableProps {
  rows: UploadRow[];
  sources: Record<string, UploadSource>;
  states: Record<string, RowState>;
  checks: Record<string, RowCheck>;
  results: Record<string, RowResult>;
  /** 同じ点検・対象月の登録済みの報告書の数（報告書の行。追加になることを知らせる） */
  existingCounts: Record<string, number>;
  /** 決まった点検の保守会社・管理会社の名前（未入力のときに薄く出す） */
  derivedNames: Record<string, { vendor: string | null; management: string | null }>;
  /** 区間の大きさ（切り出したもの。分からなければ無し） */
  sizes: Record<string, number>;
  selected: ReadonlySet<string>;
  activeRowKey: string | null;
  touched: boolean;
  disabled: boolean;
  today: string;
  options: RowOptions;
  /**
   * その他ファイルの行の保守会社を固定して見せる値（管理者以外。DB は保守会社のアカウントを自社に、管理会社を無しに固定するので、
   * 選べても保存されない）。undefined なら選べる（管理者）
   */
  fixedOtherVendorId?: string;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onActivate: (key: string) => void;
  onChange: (key: string, patch: Partial<RowInput>) => void;
  /** 詳細で、自動で読んだ食い違いの値に置き換える */
  onTakeConflict: (key: string, field: RowField) => void;
}

const th = 'border-b border-gray-200 px-1 py-0.5 text-left font-medium text-gray-600 whitespace-nowrap';
const td = 'border-b border-gray-100 px-1 py-0.5 align-top';
const fieldCls = 'block w-full rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px]';

/** ファイルのアップロード（修正依頼1029(1)）の右側: 1区間1行の表 */
export function UploadRowsTable(props: UploadRowsTableProps) {
  const { rows, selected, disabled } = props;
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.key));
  return (
    // 1366x768 でも横スクロールなしに全部の列が見えるよう、列幅を詰める（合計 58.75rem ≒ 940px。修正依頼1029 本番確認(1)）。
    // table-fixed + w-full なので、広い画面では余った幅を列幅の比で配る。1536 以上は物件（見出しの注記）とページ（「（2ページ削除）」）を広げて折り返しを減らす
    <table className="w-full min-w-[58.75rem] table-fixed border-collapse text-[11px]" data-testid="upload-rows">
      <thead className="sticky top-0 z-10 bg-gray-50">
        <tr>
          <th className={cn(th, 'w-6')}>
            <input
              type="checkbox"
              aria-label="すべての行を選ぶ"
              checked={allChecked}
              disabled={disabled || rows.length === 0}
              onChange={(e) => props.onToggleAll(e.target.checked)}
            />
          </th>
          <th className={cn(th, 'w-16')}>ステータス</th>
          <th className={cn(th, 'w-[4.5rem]')}>区分</th>
          <th className={cn(th, 'w-11')}>区間</th>
          <th className={cn(th, 'w-12 2xl:w-20')}>ページ</th>
          <th className={cn(th, 'w-[5.25rem]')}>
            No
            <span className="block text-[10px] font-normal text-gray-400">対象月</span>
          </th>
          <th className={cn(th, 'w-24')}>
            実施日
            <span className="block text-[10px] font-normal text-gray-400">点検開始日</span>
          </th>
          <th className={cn(th, 'w-[7.5rem] 2xl:w-40')}>
            物件<span className="text-red-600">*</span>
            <span className="block whitespace-normal text-[10px] font-normal leading-tight text-gray-400">※リストに無い建物は建物追加申請を</span>
          </th>
          <th className={cn(th, 'w-24')}>点検種別</th>
          <th className={cn(th, 'w-14')}>メモ</th>
          <th className={cn(th, 'w-24')}>管理会社</th>
          <th className={cn(th, 'w-24')}>保守会社</th>
          <th className={cn(th, 'w-11')}>詳細</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Fragment key={row.key}>
            <RowLine
              {...props}
              row={row}
              detailOpen={openDetail === row.key}
              onDetail={() => setOpenDetail((cur) => (cur === row.key ? null : row.key))}
            />
            {openDetail === row.key && <DetailLine {...props} row={row} />}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={13} className="px-2 py-4 text-center text-xs text-gray-400">
              ファイルを追加すると、ここに1区間1行で並びます。
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function StatusCell({ check, result }: { check: RowCheck | undefined; result: RowResult | undefined }) {
  if (result?.state === 'running')
    return (
      <span className="inline-flex items-center gap-0.5 text-gray-600">
        <Spinner size="sm" />
        送信中
      </span>
    );
  if (result?.state === 'ok') return <span className="rounded bg-green-100 px-1 text-green-800">登録済</span>;
  if (result?.state === 'skipped') return <span className="rounded bg-gray-100 px-1 text-gray-700">提出済</span>;
  if (result?.state === 'error') return <span className="rounded bg-red-100 px-1 text-red-800">失敗</span>;
  if (check?.skip) return <span className="rounded bg-gray-100 px-1 text-gray-500">送らない</span>;
  if (check?.needsReview) return <span className="rounded bg-amber-100 px-1 font-medium text-red-700 ring-1 ring-amber-300">要確認</span>;
  return <span className="rounded bg-blue-50 px-1 text-blue-800">入力済</span>;
}

function RowLine({
  row,
  sources,
  states,
  checks,
  results,
  existingCounts,
  derivedNames,
  selected,
  activeRowKey,
  touched,
  disabled,
  today,
  options,
  fixedOtherVendorId,
  onToggle,
  onActivate,
  onChange,
  detailOpen,
  onDetail,
}: UploadRowsTableProps & { row: UploadRow; detailOpen: boolean; onDetail: () => void }) {
  const state = states[row.key];
  const input = state?.input;
  const check = checks[row.key];
  const result = results[row.key];
  const locked = disabled || isRowFinished(result);
  if (!input) return null;
  // 送れない理由は「登録する」を押してから赤くする（開いた直後から赤だらけにしない。ステータスの「要確認」は先に出る）
  const err = (f: string) => (touched ? (check?.errors as Record<string, string | undefined> | undefined)?.[f] : undefined);
  const conflict = (f: RowField) => !!state?.conflicts[f];
  const isReport = input.category === 'report';
  const source = sources[row.sourceId];
  const set = (patch: Partial<RowInput>) => onChange(row.key, patch);
  const derived = derivedNames[row.key];
  const cellErr = (f: string, extra?: boolean) => cn((err(f) || extra) && 'border-red-500 bg-red-50');
  return (
    <tr
      className={cn('hover:bg-blue-50/40', activeRowKey === row.key && 'bg-blue-50', check?.skip && 'text-gray-400')}
      data-testid={`upload-row-${row.no}`}
      onFocusCapture={() => onActivate(row.key)}
      onClick={() => onActivate(row.key)}
    >
      <td className={td}>
        <input type="checkbox" aria-label={`行${row.no}を選ぶ`} checked={selected.has(row.key)} disabled={disabled} onChange={() => onToggle(row.key)} />
      </td>
      <td className={td}>
        <StatusCell check={check} result={result} />
      </td>
      <td className={td}>
        <select
          aria-label={`行${row.no}の区分`}
          className={cn(fieldCls, 'field-required', cellErr('category', conflict('category')))}
          value={input.category}
          disabled={locked}
          onChange={(e) => set({ category: e.target.value as UploadCategory })}
        >
          <option value="">選ぶ</option>
          {options.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {input.category === 'other' && (
          <input
            aria-label={`行${row.no}のその他の内容`}
            placeholder="内容"
            className={cn(fieldCls, 'mt-0.5', cellErr('categoryNote'))}
            value={input.categoryNote}
            maxLength={100}
            disabled={locked}
            onChange={(e) => set({ categoryNote: e.target.value })}
          />
        )}
      </td>
      <td className={td}>
        <span className={cn('inline-block rounded border px-1', colorOf(row.no))}>
          {source?.kind === 'pdf' ? `区間${row.segment?.no ?? 1}` : 'ファイル'}
        </span>
      </td>
      <td className={cn(td, 'break-all text-gray-700')}>{rowPageLabel(row)}</td>
      <td className={td}>
        <span className="text-gray-500">{row.no}</span>
        <input
          type="month"
          aria-label={`行${row.no}の対象月`}
          title="報告書の対象月（空なら実施日の月）"
          className={cn(fieldCls, cellErr('targetMonth', conflict('targetMonth')))}
          value={input.targetMonth}
          disabled={locked || !isReport}
          onChange={(e) => set({ targetMonth: e.target.value })}
        />
        {isReport && !input.targetMonth && input.performedOn && (
          <span className="text-[10px] text-gray-400">{formatMonth(`${input.performedOn.slice(0, 7)}-01`)}</span>
        )}
      </td>
      <td className={td}>
        <input
          type="date"
          aria-label={`行${row.no}の実施日`}
          className={cn(fieldCls, isReport && 'field-required', cellErr('performedOn', conflict('performedOn')))}
          value={input.performedOn}
          max="9999-12-31"
          disabled={locked}
          onChange={(e) => set({ performedOn: e.target.value })}
        />
        <span className="flex gap-1 text-[10px]">
          <button type="button" className="text-blue-700 hover:underline disabled:opacity-40" disabled={locked} onClick={() => set({ performedOn: today })}>
            今日
          </button>
          <button
            type="button"
            className="text-blue-700 hover:underline disabled:opacity-40"
            disabled={locked}
            onClick={() => set({ performedOn: firstDayOfPreviousMonth(today) })}
          >
            先月頭
          </button>
        </span>
        {input.performedOn > today && <span className="block text-[10px] text-amber-700">未来の日付です</span>}
      </td>
      <td className={td}>
        <Combobox
          aria-label={`行${row.no}の物件`}
          className={cn('field-required py-0.5 text-[11px]', cellErr('propertyCode', conflict('propertyCode')))}
          value={input.propertyCode}
          options={options.properties}
          placeholder="🔍 物件名・コード"
          disabled={locked}
          onChange={(v) => set({ propertyCode: v })}
        />
      </td>
      <td className={td}>
        <Combobox
          aria-label={`行${row.no}の点検種別`}
          className={cn(isReport && 'field-required', 'py-0.5 text-[11px]', cellErr('inspectionType', conflict('inspectionType') || (touched && !!check?.errors.inspection)))}
          value={input.inspectionType}
          options={options.inspectionTypesOf(input.propertyCode)}
          placeholder={isReport ? '🔍 点検種別' : '（報告書のとき）'}
          disabled={locked || !isReport}
          onChange={(v) => set({ inspectionType: v })}
        />
        {isReport && (existingCounts[row.key] ?? 0) > 0 && !result && (
          <span className="block text-[10px] text-amber-700">登録済み{existingCounts[row.key]}件（追加します）</span>
        )}
      </td>
      <td className={td}>
        <input
          aria-label={`行${row.no}のメモ`}
          placeholder="メモ"
          className={fieldCls}
          value={input.note}
          maxLength={500}
          disabled={locked}
          onChange={(e) => set({ note: e.target.value })}
        />
      </td>
      <td className={td}>
        <Combobox
          aria-label={`行${row.no}の管理会社`}
          className={cn('py-0.5 text-[11px]', cellErr('managementCompanyId', conflict('managementCompanyId')))}
          value={input.managementCompanyId}
          options={options.managementCompanies}
          placeholder={derived?.management ?? '🔍 管理会社'}
          disabled={locked}
          onChange={(v) => set({ managementCompanyId: v })}
        />
      </td>
      <td className={td}>
        {!isReport && fixedOtherVendorId !== undefined ? (
          <Combobox
            aria-label={`行${row.no}の保守会社`}
            className="py-0.5 text-[11px]"
            value={fixedOtherVendorId}
            options={options.vendors}
            placeholder={fixedOtherVendorId ? '' : '（なし）'}
            disabled
            onChange={() => {}}
          />
        ) : (
          <Combobox
            aria-label={`行${row.no}の保守会社`}
            className={cn('py-0.5 text-[11px]', cellErr('vendorId', conflict('vendorId')))}
            value={input.vendorId}
            options={options.vendors}
            placeholder={derived?.vendor ?? '🔍 保守会社'}
            disabled={locked}
            onChange={(v) => set({ vendorId: v })}
          />
        )}
      </td>
      <td className={td}>
        <Button
          variant="secondary"
          size="sm"
          className="h-6 px-1 text-[11px]"
          aria-expanded={detailOpen}
          aria-label={`行${row.no}の詳細`}
          onClick={(e) => {
            e.stopPropagation();
            onDetail();
          }}
        >
          詳細
        </Button>
      </td>
    </tr>
  );
}

/** 保存するファイル名（報告書は「実施日_建物名_点検種別.pdf」、その他ファイルは「作業実施日_建物名_区分.拡張子」。前の画面と同じ規則） */
function savedNameOf(input: RowInput, check: RowCheck | undefined, source: UploadSource | undefined, options: RowOptions): string {
  if (!source || !input.category || !input.performedOn) return '';
  if (input.category === 'report') {
    if (!check?.inspection) return '';
    return buildReportFileName({
      performedOn: input.performedOn,
      propertyName: check.inspection.property_name,
      inspectionTypeLabel: check.inspection.inspection_type_label ?? '',
    });
  }
  const propertyName = options.properties.find((o) => o.value === input.propertyCode)?.label ?? '';
  if (!propertyName) return '';
  return buildPropertyFileName({
    docDate: input.performedOn,
    propertyName,
    categoryLabel: propertyFileCategoryLabel({ category: input.category, category_note: input.category === 'other' ? input.categoryNote.trim() : null }),
    originalName: source.file.name,
    index: 0,
    total: 1,
  });
}

const FIELD_LABEL: Record<RowField, string> = {
  category: '区分',
  categoryNote: 'その他の内容',
  performedOn: '実施日',
  propertyCode: '物件',
  inspectionType: '点検種別',
  targetMonth: '対象月',
  note: 'メモ',
  managementCompanyId: '管理会社',
  vendorId: '保守会社',
};

/** 詳細の行: 元のファイル・区間の大きさ・値の出どころ・食い違い（置き換えボタン）・送れない理由・結果 */
function DetailLine({
  row,
  sources,
  states,
  checks,
  results,
  sizes,
  options,
  onTakeConflict,
  disabled,
}: UploadRowsTableProps & { row: UploadRow }) {
  const state = states[row.key];
  const check = checks[row.key];
  const result = results[row.key];
  const source = sources[row.sourceId];
  if (!state) return null;
  const labelOf = (f: RowField, v: string) => {
    if (f === 'category') return options.categories.find((c) => c.value === v)?.label ?? v;
    if (f === 'propertyCode') return options.properties.find((o) => o.value === v)?.label ?? v;
    if (f === 'vendorId') return options.vendors.find((o) => o.value === v)?.label ?? v;
    if (f === 'managementCompanyId') return options.managementCompanies.find((o) => o.value === v)?.label ?? v;
    return v;
  };
  const sourced = (Object.entries(state.sources) as [RowField, keyof typeof FIELD_SOURCE_LABEL][]).filter(([f]) => state.input[f]);
  return (
    <tr className="bg-gray-50" data-testid={`upload-row-detail-${row.no}`}>
      <td />
      <td colSpan={12} className="space-y-0.5 px-1 py-1 text-[11px] text-gray-700">
        <p>
          元のファイル: <span className="break-all">{source?.file.name}</span>
          {source && `（${formatBytes(source.file.size)}）`}
          {sizes[row.key] !== undefined && `・送る大きさ ${formatBytes(sizes[row.key]!)}`}
        </p>
        {sourced.length > 0 && (
          <p>
            自動で入れた値:{' '}
            {sourced.map(([f, s]) => `${FIELD_LABEL[f]}=${labelOf(f, state.input[f])}（${FIELD_SOURCE_LABEL[s]}）`).join('・')}
          </p>
        )}
        {(Object.entries(state.conflicts) as [RowField, { value: string; source: keyof typeof FIELD_SOURCE_LABEL }][]).map(([f, c]) => (
          <p key={f} className="text-amber-800">
            食い違い: {FIELD_LABEL[f]}は「{labelOf(f, state.input[f])}」ですが、{FIELD_SOURCE_LABEL[c.source]}では「{labelOf(f, c.value)}」
            <button
              type="button"
              className="ml-1 rounded border border-amber-400 bg-white px-1 hover:bg-amber-50 disabled:opacity-40"
              disabled={disabled || isRowFinished(result)}
              onClick={() => onTakeConflict(row.key, f)}
            >
              「{labelOf(f, c.value)}」にする
            </button>
            <span className="ml-1 text-gray-500">（今の値のままでよければ、欄で選び直すと解消します）</span>
          </p>
        ))}
        {check &&
          Object.values(check.errors)
            .filter(Boolean)
            .map((e) => (
              <p key={e} className="text-red-700">
                {e}
              </p>
            ))}
        {check?.inspection && (
          <p>
            登録する点検: {check.inspection.property_name}・{check.inspection.inspection_type_label}・{check.inspection.vendor_name ?? '保守会社未設定'}
          </p>
        )}
        {savedNameOf(state.input, check, source, options) && (
          <p>
            保存するファイル名: <span className="break-all font-mono">{savedNameOf(state.input, check, source, options)}</span>
            <span className="ml-1 text-gray-400">（同じ名前があるときは末尾に _2 などが付きます）</span>
          </p>
        )}
        {result?.state === 'ok' && <p className="text-green-700">登録しました（{result.fileName}）</p>}
        {result?.state === 'skipped' && (
          <p>同じ内容の報告書が提出済みです（{result.otherMonth ? `${formatMonth(result.otherMonth)}分・` : ''}送っていません）</p>
        )}
        {result?.state === 'error' && <p className="break-all text-red-700">失敗: {result.message}</p>}
      </td>
    </tr>
  );
}
