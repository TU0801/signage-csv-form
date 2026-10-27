import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn, normalizeSearch } from '@/lib/utils';

export interface FilterOption {
  value: string;
  /** 一覧に出す表示（無ければ value） */
  label?: ReactNode;
  /** 文字で探すときの文字（無ければ value） */
  searchText?: string;
  /** 該当する行の数 */
  count: number;
}

interface ValueFilterPopoverProps {
  /** 押すと開くボタンの中身 */
  trigger: ReactNode;
  /** ボタンの title・aria-label */
  title: string;
  triggerClassName?: string;
  /** 開いたときに候補を作る（開くたびに今の行から数え直す） */
  getOptions: () => FilterOption[];
  /** 今選んでいる値（空 = 絞り込みなし） */
  selected: readonly string[];
  /** OK で確定（空 = 絞り込みを外す） */
  onApply: (values: string[]) => void;
  /** 文字で候補を絞る欄を出す */
  searchable?: boolean;
  searchPlaceholder?: string;
}

/**
 * 一覧から複数選んで絞り込むポップアップ（修正依頼1027 (6)・(3)）。文字を入れると候補を絞り、
 * 『表示中をすべて選択』で文字に合うものをまとめて選べる。OK で確定、キャンセル・外を押す・Esc で閉じる。
 * 表の見出し（横スクロールする入れ物の中）から開くので、画面に固定した位置（position: fixed）に出す
 */
export function ValueFilterPopover({
  trigger,
  title,
  triggerClassName,
  getOptions,
  selected,
  onApply,
  searchable = true,
  searchPlaceholder = '文字で絞り込み',
}: ValueFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    setOptions(getOptions());
    setDraft(new Set(selected));
    setQuery('');
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 2, left: rect.left });
    setOpen(true);
  };

  // 画面の右端からはみ出さないように左へ寄せる
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const width = panelRef.current.offsetWidth;
    const max = window.innerWidth - width - 8;
    if (pos.left > max) setPos((p) => ({ ...p, left: Math.max(8, max) }));
  }, [open, pos.left]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = normalizeSearch(query);
    return q ? options.filter((o) => normalizeSearch(o.searchText ?? o.value).includes(q)) : options;
  }, [options, query]);

  const toggle = (value: string) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const apply = () => {
    // 候補の並びのまま渡す
    onApply(options.filter((o) => draft.has(o.value)).map((o) => o.value));
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          'inline-flex h-5 items-center rounded px-0.5 text-[11px] leading-none hover:bg-gray-200',
          selected.length > 0 && 'bg-blue-100 text-blue-800',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={title}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-64 rounded-md border border-gray-300 bg-white p-2 text-xs font-normal text-gray-800 shadow-lg"
          >
            {searchable && (
              <input
                type="search"
                autoFocus
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    apply();
                  }
                }}
                className="mb-1.5 h-7 w-full rounded border border-gray-300 px-1.5 text-xs"
              />
            )}
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <button
                type="button"
                className="text-blue-700 hover:underline"
                onClick={() => setDraft((prev) => new Set([...prev, ...shown.map((o) => o.value)]))}
              >
                {query ? '表示中をすべて選択' : 'すべて選択'}
              </button>
              <button type="button" className="text-blue-700 hover:underline" onClick={() => setDraft(new Set())}>
                選択をクリア
              </button>
              <span className="ml-auto text-gray-500">{draft.size}件選択</span>
            </div>
            <ul className="max-h-64 overflow-y-auto rounded border border-gray-200" data-testid="filter-options">
              {shown.length === 0 ? (
                <li className="px-1.5 py-1 text-gray-400">該当なし</li>
              ) : (
                shown.map((o) => (
                  <li key={o.value}>
                    <label className="flex cursor-pointer items-start gap-1.5 px-1.5 py-0.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={draft.has(o.value)}
                        onChange={() => toggle(o.value)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                      />
                      <span className="min-w-0 flex-1 whitespace-pre-line break-all leading-snug">{o.label ?? o.value}</span>
                      <span className="shrink-0 tabular-nums text-gray-400">{o.count}</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                className="h-6 rounded border border-gray-300 bg-white px-2 text-xs hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </button>
              <button type="button" className="h-6 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700" onClick={apply}>
                OK
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
