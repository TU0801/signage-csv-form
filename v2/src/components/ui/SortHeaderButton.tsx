import type { ReactNode } from 'react';

/*
 * 表の見出しの並べ替えボタン（▲▼を縦に重ねる。押すたびに 昇順 → 降順 → 解除）。
 * 一括入力の表（修正依頼1025 F3）から切り出し、マスター管理の物件タブでも使う（修正依頼1115 (4)）。
 */

export type SortDir = 'asc' | 'desc';

/** 並べ替えの状態（null = 並べ替えなし＝元の並び） */
export interface SortState<C extends string = string> {
  column: C;
  dir: SortDir;
}

/** 見出しを押したときの次の状態（昇順 → 降順 → 解除） */
export function nextSort<C extends string>(current: SortState<C> | null, column: C): SortState<C> | null {
  if (!current || current.column !== column) return { column, dir: 'asc' };
  if (current.dir === 'asc') return { column, dir: 'desc' };
  return null;
}

/** 見出しの aria-sort（並べ替えていない列は none） */
export function ariaSortOf<C extends string>(sort: SortState<C> | null, column: C): 'ascending' | 'descending' | 'none' {
  if (sort?.column !== column) return 'none';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}

export function SortHeaderButton<C extends string>({
  column,
  sort,
  onSortChange,
  label,
  title = '押すたびに 昇順 → 降順 → 解除',
  children,
}: {
  column: C;
  sort: SortState<C> | null;
  /** 省略すると見出しの文字だけを出す（並べ替えなし） */
  onSortChange?: (sort: SortState<C> | null) => void;
  /** 渡すと aria-label を「{label}で並べ替え（昇順）」にする。省略すると名前は見出しの文字のまま（状態は th の aria-sort で伝える） */
  label?: string;
  title?: string;
  children: ReactNode;
}) {
  const active = sort?.column === column ? sort.dir : null;
  if (!onSortChange) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSort(sort, column))}
      className="inline-flex items-start gap-0.5 text-left font-medium hover:text-blue-700"
      title={title}
      aria-label={
        label === undefined
          ? undefined
          : `${label}で並べ替え${active === 'asc' ? '（昇順）' : active === 'desc' ? '（降順）' : ''}`
      }
      data-sort={active ?? undefined}
    >
      <span>{children}</span>
      <span className="flex flex-col text-[8px] leading-[8px]" aria-hidden>
        <span className={active === 'asc' ? 'text-blue-700' : 'text-gray-300'}>▲</span>
        <span className={active === 'desc' ? 'text-blue-700' : 'text-gray-300'}>▼</span>
      </span>
    </button>
  );
}
