import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn, normalizeSearch } from '@/lib/utils';

export interface CheckOption {
  value: string;
  label: string;
  /** ラベルの前に小さく出すコード（物件コードなど）。検索の対象にもなる */
  code?: string;
  /** 行の右端に小さく出す補足（端末台数・分類など） */
  meta?: string;
  /** 絞り込みボタンの区分（点検種別の分類など）。検索の対象にもなる */
  group?: string;
}

interface CheckListSelectModalProps {
  open: boolean;
  title: string;
  /** 説明文（消さない） */
  description: string;
  searchPlaceholder: string;
  /** 表示順に並べた候補 */
  options: CheckOption[];
  /** 絞り込みボタンを出す区分の順番。省略時はボタンを出さない */
  groups?: string[];
  /** lg 幅での列数 */
  columns?: 3 | 4;
  onClose: () => void;
  onConfirm: (values: string[]) => void;
}

const LG_COLUMNS = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' } as const;

/**
 * 検索つきのチェックボックス一覧の複数選択モーダル（紐付け管理の物件・点検種別の追加で共用）。
 * 候補は 150〜250 件あるので、検索・区分での絞り込み・表示中の一括選択・選択中だけの表示を持つ。
 */
// v1: admin.html #buildingSelectModal / #inspectionSelectModal（v1 はピル型ボタンを全件並べるだけ）
export function CheckListSelectModal({
  open,
  title,
  description,
  searchPlaceholder,
  options,
  groups,
  columns = 3,
  onClose,
  onConfirm,
}: CheckListSelectModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();

  // 開くたびに検索欄へ。showModal() は Modal（親）の effect で呼ばれ、最初のボタン（×）にフォーカスを移すので、その後に移す
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const searchKeys = useMemo(
    () => new Map(options.map((o) => [o.value, normalizeSearch(`${o.code ?? ''} ${o.label} ${o.group ?? ''}`)])),
    [options],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of options) if (o.group) counts.set(o.group, (counts.get(o.group) ?? 0) + 1);
    return counts;
  }, [options]);

  // 選択は絞り込みと関係なく保つ（表示だけを絞る）
  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    return options.filter(
      (o) =>
        (!q || searchKeys.get(o.value)!.includes(q)) &&
        (!group || o.group === group) &&
        (!onlySelected || selected.has(o.value)),
    );
  }, [options, searchKeys, query, group, onlySelected, selected]);

  const visibleSelectedCount = visible.filter((o) => selected.has(o.value)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [visibleSelectedCount, allVisibleSelected]);

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // 表示中の候補だけを選ぶ・外す（検索や区分で隠れている選択はそのまま）
  const toggleVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of visible) {
        if (allVisibleSelected) next.delete(o.value);
        else next.add(o.value);
      }
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setQuery('');
    setGroup(null);
    setOnlySelected(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const confirm = () => {
    // 候補の並び順で返す
    const values = options.filter((o) => selected.has(o.value)).map((o) => o.value);
    if (values.length === 0) return;
    reset();
    onConfirm(values);
  };

  const showGroups = !!groups && groups.length > 1;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      className="max-w-6xl"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-gray-600">
            <span className="font-medium text-gray-900">{selected.size}件</span>選択中
          </span>
          {selected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
                // このボタン自体が消えるので、フォーカスを検索欄へ移す
                searchRef.current?.focus();
              }}
            >
              選択を解除
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={close}>
            キャンセル
          </Button>
          <Button size="sm" onClick={confirm} disabled={selected.size === 0}>
            {selected.size > 0 ? `追加（${selected.size}件）` : '追加'}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-gray-500">{description}</p>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <input
          ref={searchRef}
          type="search"
          aria-label={searchPlaceholder}
          placeholder={`${searchPlaceholder}...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full max-w-sm rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={visible.length === 0}
            onChange={toggleVisible}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          表示中の{visible.length}件をすべて選択
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          選択中のみ表示
        </label>
        <span className="ml-auto text-xs text-gray-500">候補 {options.length}件</span>
      </div>
      {showGroups && (
        <div role="group" aria-label="区分で絞り込み" className="mb-2 flex flex-wrap gap-1">
          {[null, ...groups].map((g) => {
            const active = group === g;
            const count = g === null ? options.length : (groupCounts.get(g) ?? 0);
            if (g !== null && count === 0) return null;
            return (
              <button
                key={g ?? ''}
                type="button"
                aria-pressed={active}
                onClick={() => setGroup(g)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {g ?? 'すべて'} {count}
              </button>
            );
          })}
        </div>
      )}
      {/* 高さを固定して、絞り込みでモーダルの大きさが変わらないようにする（狭い画面は説明文と操作が折り返すぶん低く） */}
      <div
        className={cn(
          'min-h-40 overflow-y-auto rounded border border-gray-200',
          showGroups
            ? 'h-[calc(100dvh-24rem)] md:h-[calc(100dvh-19rem)]'
            : 'h-[calc(100dvh-22rem)] md:h-[calc(100dvh-17rem)]',
        )}
      >
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {onlySelected && selected.size === 0 ? '選択中の候補はありません' : '該当する候補がありません'}
          </p>
        ) : (
          <ul className={cn('grid grid-cols-1 gap-x-2 p-1 md:grid-cols-2', LG_COLUMNS[columns])}>
            {visible.map((o) => {
              const checked = selected.has(o.value);
              const name = o.code ? `${o.label}（${o.code}）` : o.label;
              const metaId = `${idPrefix}-m-${o.value}`;
              return (
                <li key={o.value}>
                  <label
                    title={name}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-sm',
                      checked ? 'bg-blue-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={name}
                      aria-describedby={o.meta ? metaId : undefined}
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                    />
                    {o.code && (
                      <span className="w-[4.75rem] shrink-0 text-xs tabular-nums text-gray-500">{o.code}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-gray-900">{o.label}</span>
                    {o.meta && (
                      <span id={metaId} className="shrink-0 text-xs text-gray-400">
                        {o.meta}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
