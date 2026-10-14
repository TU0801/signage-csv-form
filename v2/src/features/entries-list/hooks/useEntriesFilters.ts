import { useState, useCallback, useEffect } from 'react';
import type { AdminEntryFilters } from '@/lib/api/admin-entries';
import { todayUtc } from '@/lib/utils';

export type EntriesFilters = AdminEntryFilters;

const emptyFilters: EntriesFilters = {
  propertyCode: '',
  startDate: '',
  endDate: '',
  vendorName: '',
};

/** v1 と同じ「今日」。toISOString の日付部分（UTC。v1 の split('T')[0] と同じ値）なので、JST 0〜9時は前日になる */
// v1: js/admin.js loadAllData（const today = new Date().toISOString().split('T')[0]）
export function todayForFilter(now: Date = new Date()): string {
  return todayUtc(now);
}

/**
 * 絞り込みは画面を開いている間だけ保つ（v1 は DOM の値なので、タブを切り替えても残り、再読み込みで消える）。
 * v1 は localStorage（admin_entry_filters）へ保存・復元しているが、init の順序のせいで復元されるのは
 * 常に「開始日=今日・ほかは空」なので、v2 は保存も復元もせず同じ結果にする。
 */
let sessionFilters: EntriesFilters | null = null;

// v1: js/admin.js loadAllData（#filterStartDate が空なら今日を入れる。init と承認・却下のあとに呼ばれる）
export function applyDefaultStartDate(now: Date = new Date()): void {
  const current = sessionFilters ?? emptyFilters;
  if (!current.startDate) sessionFilters = { ...current, startDate: todayForFilter(now) };
}

// 初回（v1 の init）だけ既定を入れる。タブを切り替えて戻ったときは、空にした開始日も空のまま（v1 と同じ）
function initialFilters(): EntriesFilters {
  if (sessionFilters === null) applyDefaultStartDate();
  return sessionFilters ?? emptyFilters;
}

/** データ一覧の今の絞り込み（サイドバーの承認済み件数に使う。v1 は init でデータ一覧と同じ条件の件数を出す） */
export function currentEntriesFilters(): EntriesFilters {
  return initialFilters();
}

export function useEntriesFilters() {
  const [filters, setFilters] = useState<EntriesFilters>(initialFilters);

  useEffect(() => {
    sessionFilters = filters;
  }, [filters]);

  const updateFilter = useCallback(
    <K extends keyof EntriesFilters>(key: K, value: EntriesFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { filters, updateFilter };
}

/** Exported for testing */
export function resetSessionFiltersForTest(): void {
  sessionFilters = null;
}
export function getSessionFiltersForTest(): EntriesFilters | null {
  return sessionFilters;
}
