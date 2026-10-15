import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn, normalizeSearch } from '@/lib/utils';

export interface BuildingOption {
  code: string;
  name: string;
  terminalCount: number;
}

interface BuildingSelectModalProps {
  open: boolean;
  /** 物件コード順 */
  options: BuildingOption[];
  onClose: () => void;
  onConfirm: (codes: string[]) => void;
}

/**
 * 物件（ビル）の複数選択モーダル。候補は保守会社ごとに 150〜250 件あるので、検索・表示中の一括選択・
 * 選択中だけの表示を持つ。点検種別は件数が少ないので PillSelectModal のまま。
 */
// v1: admin.html #buildingSelectModal（v1 はピル型ボタンを全件並べるだけ）
export function BuildingSelectModal({ open, options, onClose, onConfirm }: BuildingSelectModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 開くたびに検索欄へ。showModal() は Modal（親）の effect で呼ばれ、最初のボタン（×）にフォーカスを移すので、その後に移す
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const searchKeys = useMemo(
    () => new Map(options.map((o) => [o.code, normalizeSearch(`${o.code} ${o.name}`)])),
    [options],
  );

  // 選択は絞り込みと関係なく保つ（表示だけを絞る）
  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    return options.filter(
      (o) => (!q || searchKeys.get(o.code)!.includes(q)) && (!onlySelected || selected.has(o.code)),
    );
  }, [options, searchKeys, query, onlySelected, selected]);

  const visibleSelectedCount = visible.filter((o) => selected.has(o.code)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [visibleSelectedCount, allVisibleSelected]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // 表示中の物件だけを選ぶ・外す（検索で隠れている選択はそのまま）
  const toggleVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of visible) {
        if (allVisibleSelected) next.delete(o.code);
        else next.add(o.code);
      }
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setQuery('');
    setOnlySelected(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const confirm = () => {
    // 候補の並び順（物件コード順）で返す
    const codes = options.filter((o) => selected.has(o.code)).map((o) => o.code);
    if (codes.length === 0) return;
    reset();
    onConfirm(codes);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="物件を追加"
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
      <p className="mb-2 text-xs text-gray-500">
        追加する物件を選択してください（複数選択可）。物件名・物件コードで絞り込めます（ひらがな・カタカナ、全角・半角は区別しません）。
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <input
          ref={searchRef}
          type="search"
          aria-label="物件コード・物件名で検索"
          placeholder="物件コード・物件名で検索..."
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
      {/* 高さを固定して、絞り込みでモーダルの大きさが変わらないようにする（狭い画面は説明文と操作が折り返すぶん低く） */}
      <div className="h-[calc(100dvh-22rem)] min-h-40 md:h-[calc(100dvh-17rem)] overflow-y-auto rounded border border-gray-200">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {onlySelected && selected.size === 0 ? '選択中の物件はありません' : '該当する物件がありません'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-2 p-1 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((o) => {
              const checked = selected.has(o.code);
              return (
                <li key={o.code}>
                  <label
                    title={`${o.name}（${o.code}）`}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-sm',
                      checked ? 'bg-blue-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${o.name}（${o.code}）`}
                      aria-describedby={`${idPrefix}-t-${o.code}`}
                      checked={checked}
                      onChange={() => toggle(o.code)}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                    />
                    <span className="w-[4.75rem] shrink-0 text-xs tabular-nums text-gray-500">{o.code}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-900">{o.name}</span>
                    <span id={`${idPrefix}-t-${o.code}`} className="shrink-0 text-xs text-gray-400">
                      {o.terminalCount > 0 ? `端末${o.terminalCount}台` : '端末なし'}
                    </span>
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
