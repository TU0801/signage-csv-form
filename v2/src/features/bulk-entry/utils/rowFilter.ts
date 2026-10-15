import type { BulkEntryRow, BulkFilter } from '../types';

/** 表示の絞り込み（すべて／有効のみ／エラーのみ）に合う行か */
export function matchesBulkFilter(row: Pick<BulkEntryRow, 'isValid'>, filter: BulkFilter): boolean {
  return filter === 'all' || (filter === 'valid' ? row.isValid : !row.isValid);
}
