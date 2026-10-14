import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  options: Option[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
  /** 選んだあとに次のセルへ移る */
  onPicked?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  dataCol: number;
  invalid?: boolean;
}

/**
 * 検索付きのセレクト。フォーカスすると検索欄が開き、入力した文字を含む選択肢だけ残す。
 * 検索欄で Enter なら先頭の候補を選び、Escape なら閉じる。
 * v1: js/bulk-table.js setupSearchableSelect
 */
export function SearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  onChange,
  onPicked,
  onKeyDown,
  dataCol,
  invalid,
}: SearchableSelectProps) {
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const text = search.toLowerCase();
  const visible = text ? options.filter((o) => o.label.toLowerCase().includes(text)) : options;

  const close = () => {
    setActive(false);
    setSearch('');
  };

  const pick = (v: string) => {
    onChange(v);
    close();
    onPicked?.();
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      selectRef.current?.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = visible[0];
      if (first) pick(first.value);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onFocus={() => setActive(true)}
      onBlur={(e) => {
        if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      {active && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={searchPlaceholder}
          autoFocus
          className="mb-1 block w-full rounded border border-blue-400 px-2 py-1 text-xs focus:outline-none"
        />
      )}
      <select
        ref={selectRef}
        data-col={dataCol}
        value={value}
        size={active ? Math.min(visible.length + 1, 8) : undefined}
        onChange={(e) => pick(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          'block w-full rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none',
          invalid ? 'border-red-400' : 'border-gray-300',
          active && 'absolute z-20 bg-white shadow-lg',
        )}
      >
        <option value="">{placeholder}</option>
        {visible.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
