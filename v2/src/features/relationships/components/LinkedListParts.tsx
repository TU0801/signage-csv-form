import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

/** 紐付け済みの表（物件・点検種別）で共用する、行の選択・検索欄・一括解除ボタン */

export interface RowSelection {
  /** 選択中で、今の一覧にある行の id（解除済み・別の保守会社の行は含めない） */
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** 表示中の行をすべて選ぶ／すべて外す（絞り込みで隠れている選択はそのまま） */
  toggleVisible: () => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  drop: (ids: string[]) => void;
  clear: () => void;
}

/** 行の選択。選択は絞り込みと関係なく保ち、一覧から消えた行は数えない */
export function useRowSelection(all: { id: string }[], visible: { id: string }[]): RowSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedIds = all.filter((r) => selected.has(r.id)).map((r) => r.id);
  const visibleSelected = visible.filter((r) => selected.has(r.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  return {
    selectedIds,
    isSelected: (id) => selected.has(id),
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleVisible: () =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of visible) {
          if (allVisibleSelected) next.delete(r.id);
          else next.add(r.id);
        }
        return next;
      }),
    allVisibleSelected,
    someVisibleSelected: visibleSelected > 0 && !allVisibleSelected,
    drop: (ids) =>
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }),
    clear: () => setSelected(new Set()),
  };
}

/** 見出しの「表示中をすべて選択」。一部だけ選んでいるときは中間の表示にする */
export function SelectAllCheckbox({ selection }: { selection: RowSelection }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selection.someVisibleSelected;
  }, [selection.someVisibleSelected]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="rounded border-gray-300"
      aria-label="表示中をすべて選択"
      checked={selection.allVisibleSelected}
      onChange={selection.toggleVisible}
    />
  );
}

interface LinkedListToolbarProps {
  /** 「n件の物件が紐付けられています」など */
  summary: string;
  /** 絞り込み中に表示している件数。絞り込んでいなければ null */
  shownCount: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  selectedCount: number;
  onRemoveSelected: () => void;
  /** 解除を送っている間。一括解除を二重に送らないよう押せなくする */
  removing?: boolean;
  addButton: ReactNode;
}

export function LinkedListToolbar({
  summary,
  shownCount,
  query,
  onQueryChange,
  searchLabel,
  searchPlaceholder,
  selectedCount,
  onRemoveSelected,
  removing = false,
  addButton,
}: LinkedListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-gray-500 whitespace-nowrap">
        {summary}
        {shownCount !== null && `（表示 ${shownCount}件）`}
      </p>
      <input
        type="search"
        aria-label={searchLabel}
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-64 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="ml-auto flex items-center gap-2">
        {selectedCount > 0 && (
          <Button variant="danger" size="sm" onClick={onRemoveSelected} disabled={removing}>
            選択した {selectedCount} 件の紐付けを解除
          </Button>
        )}
        {addButton}
      </div>
    </div>
  );
}
