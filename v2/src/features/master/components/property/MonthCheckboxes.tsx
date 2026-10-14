const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

interface MonthCheckboxesProps {
  value: number[];
  /** 選んだ月を昇順で返す（v1 はチェックボックスの並び順＝昇順で集めていた） */
  onChange: (months: number[]) => void;
  /** 月の数字の後ろに付ける文字（設備情報は「1月」、台ごとの保守は数字だけ） */
  suffix?: string;
  label?: string;
}

// v1: admin.html #propMonthCheckboxes / js/admin-masters.js renderPropertyUnitInspections（.unit-months）
export function MonthCheckboxes({ value, onChange, suffix = '', label }: MonthCheckboxesProps) {
  const selected = new Set(value.map(Number));
  const toggle = (m: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(m);
    else next.delete(m);
    onChange(MONTHS.filter((x) => next.has(x)));
  };

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1" role="group" aria-label={label}>
      {MONTHS.map((m) => (
        <label key={m} className="inline-flex items-center gap-0.5 text-xs whitespace-nowrap">
          <input
            type="checkbox"
            value={m}
            checked={selected.has(m)}
            onChange={(e) => toggle(m, e.target.checked)}
          />
          <span>
            {m}
            {suffix}
          </span>
        </label>
      ))}
    </div>
  );
}
