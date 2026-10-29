import { Fragment } from 'react';
import type { DbVendor } from '@/types/database';
import type { PropertyUnit, UnitInspection, UnitInspectionTypeOption } from '@/types/app';
import { isBlankUnitInspection, newUnitInspection } from '../../lib/propertyForm';
import { MonthCheckboxes } from './MonthCheckboxes';
import { sortVendors } from '@/lib/vendorOptions';
import { DEFAULT_INTERVAL_MONTHS, defaultNotifyFor, parseIntervalMonths } from '@/lib/inspectionSchedule';

interface UnitInspectionEditorProps {
  units: PropertyUnit[];
  onChange: (units: PropertyUnit[]) => void;
  /** 台に付けられる点検種別（unit_inspection_type_options）。台の大分類のものだけを選べる */
  typeOptions: UnitInspectionTypeOption[];
  vendors: DbVendor[];
  onError: (message: string) => void;
}

const selectClass = 'block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';
const subLabelClass = 'mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gray-600';
const UNREAD_TITLE = '点検日連絡・インターバル・請求月を読み込めなかったため、ここでは変更できません（業務システムで変更してください）';

/**
 * 新しい行は、点検日連絡・インターバルが既定（種別の名前で決まる・12か月）と同じなら値を持たない（触っていない扱い）。
 * 持たせると、保守の無い台の選ぶ行が開いただけで「入力あり」になり、保存が「点検種別を選んでいない行」で止まる
 */
function dropDefaults(row: UnitInspection): UnitInspection {
  if (row.inspection_id) return row;
  const next = { ...row };
  if (next.notify_inspection_date === defaultNotifyFor(next.inspection_type_label)) delete next.notify_inspection_date;
  if (next.interval_months === DEFAULT_INTERVAL_MONTHS) delete next.interval_months;
  return next;
}

/** 「保存すると外します」の注記の id（点検種別の欄の aria-describedby） */
const removeNoteId = (inspectionId: string) => `unit-insp-remove-${inspectionId}`;

/**
 * 台ごとの保守（業務システムで台を登録した大分類。2026-10-14）。
 * 編集できるのは台の保守（点検種別を外す・保守の無い台に1つ足す、保守会社・点検月・検査月・点検日連絡・インターバル・請求月）。
 * 2026-10-27 修正依頼1027(7): 業務システムの「サイネージを編集」と同じ並び（点検種別の下に点検日連絡、点検月の下に請求月、検査月の下にインターバル）。
 * 台そのもの（追加・削除・保守会社固有コード・設置場所・金額）は業務システムで編集する。
 * 登録済みの行の点検種別は替えられない。替えるときは「（外す）」で外して保存し、その台の保守が0件になってから選ぶ行で選び直す
 * （保守がある台に2つ目の点検種別は足せない）。
 *
 * 2026-10-27 修正依頼1026⑥（業務システムと同じ形）: 『＋ 点検種別』と行の『外す』ボタンは無い。
 * - 外す: 保存済みの行の点検種別の欄で「（外す）」を選ぶ（行に remove が付く）。物件の保存で外す（unitsForSave が除き、差分で deletes になる）
 * - 足す: 保存済みの行が無い台に、点検種別を選ぶ行を1行だけ出す。何か入れるまでは state に入れない（入れた値を全部消したら state からも消す）
 *   その台の大分類に選べる点検種別が無ければ、選ぶ行の代わりに「保守は登録されていません」（業務システムと同じ）
 */
// v1: js/admin-masters.js renderPropertyUnitInspections
export function UnitInspectionEditor({
  units,
  onChange,
  typeOptions,
  vendors,
  onError,
}: UnitInspectionEditorProps) {
  const updateUnit = (unitIndex: number, inspections: UnitInspection[]) =>
    onChange(units.map((u, i) => (i === unitIndex ? { ...u, inspections } : u)));

  // 保守の無い台は、点検種別を選ぶ行（未保存）を1行出す。state に入れるのは何か入れたときだけ
  const rowsOf = (unit: PropertyUnit): UnitInspection[] =>
    unit.inspections.length > 0 ? unit.inspections : [newUnitInspection()];

  const setRow = (unitIndex: number, rowIndex: number, row: UnitInspection) => {
    const unit = units[unitIndex];
    if (!unit) return;
    updateUnit(
      unitIndex,
      rowsOf(unit)
        .map((r, j) => (j === rowIndex ? dropDefaults(row) : r))
        .filter((r) => !isBlankUnitInspection(r)),
    );
  };

  const updateRow = (unitIndex: number, rowIndex: number, patch: Partial<UnitInspection>) => {
    const row = units[unitIndex] && rowsOf(units[unitIndex])[rowIndex];
    if (row) setRow(unitIndex, rowIndex, { ...row, ...patch });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left whitespace-nowrap">
            <th className="cell-head font-medium text-gray-700">台（保守会社固有コード／設置場所）</th>
            <th className="cell-head font-medium text-gray-700">点検種別</th>
            <th className="cell-head font-medium text-gray-700">保守会社</th>
            <th className="cell-head font-medium text-gray-700">点検月</th>
            <th className="cell-head font-medium text-gray-700">検査月</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit, unitIndex) => {
            const showCategory = unitIndex === 0 || units[unitIndex - 1]?.category_code !== unit.category_code;
            const remarks = [unit.unit_remarks, unit.unit_remarks2].filter(Boolean).join(' ／ ');
            const rows = rowsOf(unit);
            // 台のセルは、その台の保守の行数ぶん縦に結合する（保守が無い台も1行）
            const unitCell = (
              <td rowSpan={rows.length} className="cell align-top border-r border-gray-100">
                {/* 長いコード・設置場所・備考は省略し、全文は title で見せる */}
                <div className="max-w-[16rem] truncate font-medium" title={unit.unit_code || undefined}>
                  {unit.unit_code || <span className="text-gray-400">（コードなし）</span>}
                </div>
                {unit.unit_location && (
                  <div className="max-w-[16rem] truncate text-xs text-gray-500" title={unit.unit_location}>
                    {unit.unit_location}
                  </div>
                )}
                {remarks && (
                  <div className="max-w-[16rem] truncate text-xs text-gray-500" title={remarks}>
                    {remarks}
                  </div>
                )}
              </td>
            );
            // その台の大分類の点検種別だけを選べる
            const options = typeOptions.filter((t) => t.category_code === unit.category_code);
            // 保守が無く、選べる点検種別も無い台は選ぶ行を出さない
            const nothingToShow = unit.inspections.length === 0 && options.length === 0;

            return (
              <Fragment key={unit.unit_id}>
                {showCategory && (
                  <tr className="bg-gray-100">
                    <td colSpan={5} className="cell text-xs font-semibold text-gray-700">
                      {unit.category_label || unit.category_code}
                    </td>
                  </tr>
                )}
                {nothingToShow ? (
                  <tr className="border-b border-gray-100">
                    {unitCell}
                    <td colSpan={4} className="cell text-gray-400">
                      保守は登録されていません
                    </td>
                  </tr>
                ) : rows.map((insp, rowIndex) => {
                    const legacy = [insp.legacy_remarks, insp.legacy_remarks2].filter(Boolean).join(' ／ ');
                    // 一覧に無い保守会社が付いている行は、その会社を選択肢に足して値を保つ
                    const vendorKnown = !insp.vendor_id || vendors.some((v) => v.id === insp.vendor_id);
                    // 保存済みの行で3項目が読めていなければ触らせない（送らないので、変えても保存されない）
                    const scheduleUnread = !!insp.inspection_id && insp.notify_inspection_date === undefined;
                    const notify = insp.notify_inspection_date ?? defaultNotifyFor(insp.inspection_type_label);
                    // 新しい行は既定 12（触るまで値を持たない）。保存済みで未入力の行は空のまま（placeholder 12）
                    const interval =
                      insp.interval_months === undefined
                        ? insp.inspection_id
                          ? ''
                          : String(DEFAULT_INTERVAL_MONTHS)
                        : insp.interval_months === null
                          ? ''
                          : String(insp.interval_months);
                    return (
                      <tr
                        key={insp.inspection_id ?? `new-${rowIndex}`}
                        className="border-b border-gray-100 align-top"
                      >
                        {rowIndex === 0 && unitCell}
                        <td className="cell min-w-[10rem]">
                          {insp.inspection_id ? (
                            <>
                              {/* 保存済みの行は今の点検種別か「（外す）」だけ（点検種別は替えられない） */}
                              <select
                                aria-label="点検種別"
                                aria-describedby={insp.remove ? removeNoteId(insp.inspection_id) : undefined}
                                className={`${selectClass} font-medium ${insp.remove ? 'text-red-700' : ''}`}
                                value={insp.remove ? 'remove' : ''}
                                onChange={(e) => {
                                  // 今の種別に戻したら remove をキーごと消す（開いたときと同じ形に戻す）
                                  const { remove: _drop, ...rest } = insp;
                                  void _drop;
                                  setRow(
                                    unitIndex,
                                    rowIndex,
                                    e.target.value === 'remove' ? { ...rest, remove: true } : rest,
                                  );
                                }}
                              >
                                <option value="">{insp.inspection_type_label || '（不明）'}</option>
                                <option value="remove">（外す）</option>
                              </select>
                              {insp.remove && (
                                <div id={removeNoteId(insp.inspection_id)} className="text-xs text-red-600">
                                  保存すると外します。この行のほかの欄の変更は保存されません
                                </div>
                              )}
                              {legacy && (
                                <div className="text-xs text-gray-500">切替前の備考: {legacy}</div>
                              )}
                            </>
                          ) : (
                            <select
                              aria-label="点検種別"
                              className={selectClass}
                              value={insp.inspection_type_id}
                              onChange={(e) => {
                                const v = e.target.value;
                                // 同じ台に同じ点検種別は1つ（送ると後の行で上書きされるだけなので、ここで弾く）
                                if (v && rows.some((x, j) => j !== rowIndex && x.inspection_type_id === v)) {
                                  onError('この台には同じ点検種別が既に登録されています');
                                  return;
                                }
                                // 名前も持つ（点検日連絡の既定を種別の名前で決める。業務システムと同じ）
                                updateRow(unitIndex, rowIndex, {
                                  inspection_type_id: v,
                                  inspection_type_label: options.find((t) => t.inspection_type_id === v)?.inspection_type_label ?? '',
                                });
                              }}
                            >
                              <option value="">選択...</option>
                              {options.map((t) => (
                                <option key={t.inspection_type_id} value={t.inspection_type_id}>
                                  {t.inspection_type_label}
                                </option>
                              ))}
                            </select>
                          )}
                          {!insp.remove && (
                            <label className={subLabelClass} title={scheduleUnread ? UNREAD_TITLE : '設備点検管理システムで点検日を連絡（申請）する点検か。外すと申請不要（報告書のみ）。リモート点検・警備・デジタルサイネージ点検は既定で外れます'}>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={notify}
                                disabled={scheduleUnread}
                                onChange={(e) =>
                                  updateRow(unitIndex, rowIndex, { notify_inspection_date: e.target.checked })
                                }
                              />
                              点検日連絡
                            </label>
                          )}
                        </td>
                        <td className="cell min-w-[10rem]">
                          <select
                            aria-label="保守会社"
                            className={selectClass}
                            value={insp.vendor_id ?? ''}
                            onChange={(e) => updateRow(unitIndex, rowIndex, { vendor_id: e.target.value || null })}
                          >
                            <option value="">なし</option>
                            {!vendorKnown && insp.vendor_id && (
                              <option value={insp.vendor_id}>{insp.vendor_name || '（一覧に無い保守会社）'}</option>
                            )}
                            {sortVendors(vendors).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.vendor_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="cell">
                          <MonthCheckboxes
                            stacked
                            label="点検月"
                            value={insp.inspection_months}
                            onChange={(months) => updateRow(unitIndex, rowIndex, { inspection_months: months })}
                          />
                          {/* 請求月（月次用）。空は毎月 */}
                          <div className={subLabelClass}>
                            請求月 <span className="font-normal text-gray-400">空は毎月</span>
                          </div>
                          <fieldset disabled={scheduleUnread} title={scheduleUnread ? UNREAD_TITLE : undefined}>
                            <MonthCheckboxes
                              stacked
                              label="請求月"
                              value={insp.billing_months ?? []}
                              onChange={(months) => updateRow(unitIndex, rowIndex, { billing_months: months })}
                            />
                          </fieldset>
                        </td>
                        <td className="cell">
                          <input
                            type="month"
                            aria-label="検査月"
                            className={selectClass}
                            value={insp.inspected_on ? String(insp.inspected_on).slice(0, 7) : ''}
                            onChange={(e) => updateRow(unitIndex, rowIndex, { inspected_on: e.target.value || null })}
                          />
                          {/* インターバル（検査の周期）。新しく足す行の既定 12 か月 */}
                          <label className={subLabelClass} title={scheduleUnread ? UNREAD_TITLE : undefined}>
                            インターバル
                            <input
                              type="number"
                              min={1}
                              max={120}
                              step={1}
                              aria-label="インターバル（か月）"
                              className="w-14 rounded-md border border-gray-300 px-1 py-0.5 text-right text-sm"
                              placeholder={String(DEFAULT_INTERVAL_MONTHS)}
                              value={interval}
                              disabled={scheduleUnread}
                              onChange={(e) => {
                                const parsed = parseIntervalMonths(e.target.value);
                                // 範囲外・小数は入れない（業務システムと同じ 1〜120 の整数）
                                if (parsed.error) {
                                  onError(parsed.error);
                                  return;
                                }
                                updateRow(unitIndex, rowIndex, { interval_months: parsed.value });
                              }}
                            />
                            か月
                          </label>
                        </td>
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
