import { Fragment } from 'react';
import { Button } from '@/components/ui/Button';
import type { DbVendor } from '@/types/database';
import type { PropertyUnit, UnitInspection, UnitInspectionTypeOption } from '@/types/app';
import { newUnitInspection } from '../../lib/propertyForm';
import { MonthCheckboxes } from './MonthCheckboxes';

interface UnitInspectionEditorProps {
  units: PropertyUnit[];
  onChange: (units: PropertyUnit[]) => void;
  /** 台に付けられる点検種別（unit_inspection_type_options）。台の大分類のものだけを選べる */
  typeOptions: UnitInspectionTypeOption[];
  vendors: DbVendor[];
  onError: (message: string) => void;
}

const selectClass = 'block w-full rounded-md border border-gray-300 px-2 py-1 text-sm';

/**
 * 台ごとの保守（業務システムで台を登録した大分類。2026-10-14）。
 * 編集できるのは既にある台の保守だけ（点検種別の追加・外す、保守会社・点検月・検査月）。
 * 台そのもの（追加・削除・保守会社固有コード・設置場所・金額）は業務システムで編集する。
 * 登録済みの行の点検種別は替えられない（替えるときは外して足し直す）。
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

  const updateRow = (unitIndex: number, rowIndex: number, patch: Partial<UnitInspection>) =>
    updateUnit(
      unitIndex,
      (units[unitIndex]?.inspections ?? []).map((r, j) => (j === rowIndex ? { ...r, ...patch } : r)),
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left whitespace-nowrap">
            <th className="py-2 px-2 font-medium text-gray-700">台（保守会社固有コード／設置場所）</th>
            <th className="py-2 px-2 font-medium text-gray-700">点検種別</th>
            <th className="py-2 px-2 font-medium text-gray-700">保守会社</th>
            <th className="py-2 px-2 font-medium text-gray-700">点検月</th>
            <th className="py-2 px-2 font-medium text-gray-700">検査月</th>
            <th className="py-2 px-2 font-medium text-gray-700 w-12">操作</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit, unitIndex) => {
            const showCategory = unitIndex === 0 || units[unitIndex - 1]?.category_code !== unit.category_code;
            const remarks = [unit.unit_remarks, unit.unit_remarks2].filter(Boolean).join(' ／ ');
            // 台のセルは、その台の保守の行数ぶん縦に結合する（保守が無い台も1行）
            const unitCell = (
              <td rowSpan={Math.max(1, unit.inspections.length)} className="py-2 px-2 align-top border-r border-gray-100">
                <div className="font-medium">
                  {unit.unit_code || <span className="text-gray-400">（コードなし）</span>}
                </div>
                {unit.unit_location && <div className="text-xs text-gray-500">{unit.unit_location}</div>}
                {remarks && <div className="text-xs text-gray-500">{remarks}</div>}
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="mt-1"
                  onClick={() => updateUnit(unitIndex, [...unit.inspections, newUnitInspection()])}
                >
                  ＋ 点検種別
                </Button>
              </td>
            );
            // その台の大分類の点検種別だけを選べる
            const options = typeOptions.filter((t) => t.category_code === unit.category_code);

            return (
              <Fragment key={unit.unit_id}>
                {showCategory && (
                  <tr className="bg-gray-100">
                    <td colSpan={6} className="py-1 px-2 text-xs font-semibold text-gray-700">
                      {unit.category_label || unit.category_code}
                    </td>
                  </tr>
                )}
                {unit.inspections.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    {unitCell}
                    <td colSpan={5} className="py-2 px-2 text-gray-400">
                      保守は登録されていません
                    </td>
                  </tr>
                ) : (
                  unit.inspections.map((insp, rowIndex) => {
                    const legacy = [insp.legacy_remarks, insp.legacy_remarks2].filter(Boolean).join(' ／ ');
                    // 一覧に無い保守会社が付いている行は、その会社を選択肢に足して値を保つ
                    const vendorKnown = !insp.vendor_id || vendors.some((v) => v.id === insp.vendor_id);
                    return (
                      <tr
                        key={insp.inspection_id ?? `new-${rowIndex}`}
                        className="border-b border-gray-100 align-top"
                      >
                        {rowIndex === 0 && unitCell}
                        <td className="py-2 px-2 min-w-[10rem]">
                          {insp.inspection_id ? (
                            <>
                              {insp.inspection_type_label || '-'}
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
                                if (v && unit.inspections.some((x, j) => j !== rowIndex && x.inspection_type_id === v)) {
                                  onError('この台には同じ点検種別が既に登録されています');
                                  return;
                                }
                                updateRow(unitIndex, rowIndex, { inspection_type_id: v });
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
                        </td>
                        <td className="py-2 px-2 min-w-[10rem]">
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
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.vendor_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2 min-w-[12rem]">
                          <MonthCheckboxes
                            label="点検月"
                            value={insp.inspection_months}
                            onChange={(months) => updateRow(unitIndex, rowIndex, { inspection_months: months })}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="month"
                            aria-label="検査月"
                            className={selectClass}
                            value={insp.inspected_on ? String(insp.inspected_on).slice(0, 7) : ''}
                            onChange={(e) => updateRow(unitIndex, rowIndex, { inspected_on: e.target.value || null })}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Button
                            variant="danger"
                            size="sm"
                            type="button"
                            onClick={() =>
                              updateUnit(
                                unitIndex,
                                unit.inspections.filter((_, j) => j !== rowIndex),
                              )
                            }
                          >
                            外す
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
