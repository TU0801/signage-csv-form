import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { cn, normalizeSearch } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** 見出しで分ける区分（点検種別の分類など）。検索の対象にはしない */
  group?: string;
  /** ラベルの右に小さく出す補足（物件コードなど）。検索の対象にもなる */
  hint?: string;
}

export interface ComboboxProps {
  id?: string;
  label?: string;
  /** ラベルの後ろに ' *' を付ける（入力の必須チェックは呼び出し側で行う） */
  required?: boolean;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  /** value が空のときに出す文言（例: '選択してください'） */
  placeholder?: string;
  /** 区分の見出しの並び順。ここに無い区分はその後に出てきた順、区分の無い候補は最後 */
  groups?: string[];
  disabled?: boolean;
  error?: string;
  /** 入力欄に付けるクラス（Select と同じく幅などの調整用） */
  className?: string;
  /** 絞り込んで 0 件のときの文言。既定は '該当なし' */
  emptyText?: string;
  'aria-describedby'?: string;
  /** 見える label が無いとき（絞り込みバー・表のセルなど）の名前 */
  'aria-label'?: string;
  name?: string;
  /** Modal が開いたときにこの入力欄へフォーカスさせる（Modal の [data-autofocus]） */
  'data-autofocus'?: boolean;
}

/** 一度に描く候補の上限。超えた分は件数だけ出して、入力で絞り込んでもらう */
const MAX_RENDERED = 200;
const LIST_MAX_HEIGHT = 256; // max-h-64
/** 一覧と画面の端の間に残す余白 */
const VIEWPORT_MARGIN = 8;
/** 入力欄と一覧の間 */
const LIST_GAP = 2;

function sameStyle(a: CSSProperties, b: CSSProperties) {
  const ka = Object.keys(a) as (keyof CSSProperties)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

type Row = { kind: 'group'; key: string; label: string } | { kind: 'option'; key: string; option: ComboboxOption; index: number };

/**
 * 検索つきの単一選択（長いネイティブ <select> の置き換え。物件 約250件・点検種別 約170件・保守会社 約40件）。
 * 文字を打つとラベル・値・hint で絞り込む（ひらがな/カタカナ・全角/半角・大小文字・空白を区別しない）。
 * ↑↓ で移動・Enter で決定・Escape で閉じて元の表示に戻す。値を空にする「選択なし」が要るなら value '' の候補を渡す。
 * value が候補に無いときは値をそのまま表示する。
 * 候補の一覧は position: fixed で入力欄の下に出すので、スクロールするモーダル本文の中でも切れない。
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    id,
    label,
    required,
    value,
    options,
    onChange,
    placeholder,
    groups,
    disabled,
    error,
    className,
    emptyText = '該当なし',
    'aria-describedby': ariaDescribedBy,
    'aria-label': ariaLabel,
    name,
    'data-autofocus': dataAutofocus,
  },
  ref,
) {
  const labelText = label && required ? `${label} *` : label;
  const autoId = useId();
  // Select と同じくラベルから id を作る（無ければ自動）
  const inputId = id ?? labelText?.replace(/\s+/g, '-').toLowerCase() ?? `${autoId}-input`;
  const listboxId = `${autoId}-listbox`;
  const optionId = (i: number) => `${autoId}-opt-${i}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // IME の変換中か。isComposing だけでは Safari の確定 Enter（compositionend の後に来る keyCode 229）を拾えない
  const composingRef = useRef(false);
  // 変換を確定した直後か。確定の Enter（Safari では compositionend の後に keydown が来る）で候補を選ばないようにする。
  // Chrome では keydown → compositionend → keyup の順なので keyup で解除する
  const justComposedRef = useRef(false);
  // 次の描画の後に入力欄の文字を全選択する（開いたとき・選んだ後に、打てば検索に置き換わるように）
  const selectAfterRenderRef = useRef(false);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const [open, setOpen] = useState(false);
  // 入力中の文字。null のときは選択中のラベルを出す
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  // 最後に一覧へ当てた位置。変わらなければ DOM に触らない
  const lastStyleRef = useRef<CSSProperties | null>(null);

  const selected = options.find((o) => o.value === value);
  const displayText = query ?? (selected ? selected.label : value);

  // ラベル・値・hint を別々に正規化する（つなげると normalizeSearch が空白を消し、境目をまたいで当たる）
  const searchKeys = useMemo(
    () => options.map((o) => [o.label, o.value, o.hint ?? ''].map(normalizeSearch).filter(Boolean)),
    [options],
  );

  // 区分ごとに並べ替えてから絞り込む（↑↓ の順番と見た目の順番を揃える）
  const ordered = useMemo(() => {
    const hasGroup = options.some((o) => o.group);
    const idx = options.map((o, i) => ({ o, i }));
    if (!hasGroup) return idx;
    const order = [...(groups ?? [])];
    for (const o of options) if (o.group && !order.includes(o.group)) order.push(o.group);
    const rank = (g?: string) => (g ? order.indexOf(g) : order.length);
    return idx.sort((a, b) => rank(a.o.group) - rank(b.o.group) || a.i - b.i);
  }, [options, groups]);

  const matches = useMemo(() => {
    const q = query ? normalizeSearch(query) : '';
    return q ? ordered.filter(({ i }) => searchKeys[i]?.some((k) => k.includes(q))) : ordered;
  }, [ordered, searchKeys, query]);

  const visible = useMemo(() => matches.slice(0, MAX_RENDERED).map(({ o }) => o), [matches]);
  const hiddenCount = matches.length - visible.length;

  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastGroup: string | undefined;
    visible.forEach((o, index) => {
      if (o.group !== lastGroup && (o.group || lastGroup)) {
        out.push({ kind: 'group', key: `g-${o.group ?? ''}-${index}`, label: o.group ?? 'その他' });
      }
      lastGroup = o.group;
      out.push({ kind: 'option', key: `o-${o.value}-${index}`, option: o, index });
    });
    return out;
  }, [visible]);

  // 位置は state にせず一覧の DOM に直接当てる（スクロールのたびに候補 200 件を描き直さない）
  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - LIST_GAP - VIEWPORT_MARGIN;
    const above = r.top - LIST_GAP - VIEWPORT_MARGIN;
    // 下に入らず上の方が広いときは上に出す。高さは入る分まで（はみ出すと端の候補に届かない）
    const up = below < LIST_MAX_HEIGHT && above > below;
    const maxHeight = Math.max(0, Math.min(LIST_MAX_HEIGHT, up ? above : below));
    const next: CSSProperties = up
      ? { position: 'fixed', left: r.left, width: r.width, bottom: vh - r.top + LIST_GAP, maxHeight }
      : { position: 'fixed', left: r.left, width: r.width, top: r.bottom + LIST_GAP, maxHeight };
    if (lastStyleRef.current && sameStyle(lastStyleRef.current, next)) return;
    lastStyleRef.current = next;
    list.style.cssText = '';
    for (const [k, v] of Object.entries(next)) {
      list.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), typeof v === 'number' ? `${v}px` : String(v));
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    lastStyleRef.current = null; // 開くたびに一覧の要素は作り直される
    updatePosition();
    // モーダルの本文など、window 以外のスクロールも拾うため capture で聞く。一覧自身のスクロールでは入力欄は動かない
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      // モーダルの本文などをスクロールして入力欄が見えなくなったら、一覧だけが浮いて残らないよう閉じる
      const input = inputRef.current;
      if (input && e.target instanceof Element && e.target.contains(input)) {
        const r = input.getBoundingClientRect();
        const box = e.target.getBoundingClientRect();
        if (r.bottom < box.top || r.top > box.bottom) {
          setOpen(false);
          return;
        }
      }
      updatePosition();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // ↑↓ で動かした候補を見える位置へ（jsdom には scrollIntoView が無い）
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${autoId}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, autoId]);

  useLayoutEffect(() => {
    if (!selectAfterRenderRef.current) return;
    selectAfterRenderRef.current = false;
    if (document.activeElement === inputRef.current) inputRef.current?.select();
  });

  // フォーカスだけでは開かない（Modal の初期フォーカスや Tab で一覧がかぶさらないように）。クリック・入力・↑↓ で開く
  const openList = () => {
    if (disabled || open) return;
    setOpen(true);
    setActive(visible.findIndex((o) => o.value === value));
    selectAfterRenderRef.current = true;
  };

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  };

  const choose = (o: ComboboxOption) => {
    close();
    selectAfterRenderRef.current = true;
    if (o.value !== value) onChange(o.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME の変換中・変換確定のキーでは何もしない（Safari の確定 Enter は isComposing=false・keyCode 229 で来る）
    if (composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (justComposedRef.current) {
      justComposedRef.current = false;
      if (e.key === 'Enter') return;
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!open) {
          openList();
          return;
        }
        if (visible.length === 0) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a < 0 ? (step === 1 ? 0 : visible.length - 1) : (a + step + visible.length) % visible.length));
        return;
      }
      case 'Enter': {
        if (!open) return;
        e.preventDefault(); // フォームの送信をさせない
        const target = active >= 0 ? visible[active] : visible.length === 1 ? visible[0] : undefined;
        if (target) choose(target);
        return;
      }
      case 'Escape': {
        if (!open) return; // 閉じているときはモーダルを閉じる Escape として通す
        // 囲んでいる <dialog> の Escape（UA の既定動作）と親のキー処理の両方を止める
        e.preventDefault();
        e.stopPropagation();
        close();
        selectAfterRenderRef.current = true;
        return;
      }
      case 'Tab':
        if (open) close();
        return;
    }
  };

  return (
    <div className="space-y-0.5">
      {labelText && (
        <label htmlFor={inputId} className="block text-xs font-medium text-gray-600">
          {labelText}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          name={name}
          data-autofocus={dataAutofocus || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={displayText}
          // フォーカスでは全選択だけして開かない（Modal の初期フォーカスで打っても選択中のラベルに足されないように）
          onFocus={(e) => e.currentTarget.select()}
          // mousedown では開かない（その後のクリックでキャレットが置かれ、全選択が外れる）
          onClick={openList}
          onMouseDown={() => {
            justComposedRef.current = false;
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            justComposedRef.current = true;
          }}
          onKeyUp={() => {
            justComposedRef.current = false;
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(e.target.value ? 0 : -1);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            justComposedRef.current = false;
            close();
          }}
          className={cn(
            'block w-full rounded-md border border-gray-300 py-1.5 pl-2 pr-6 text-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'disabled:bg-gray-50 disabled:text-gray-500',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            className,
          )}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {open && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={label ?? ariaLabel}
            // 位置（fixed・left・top/bottom・width・max-height）は updatePosition が当てる
            style={{ position: 'fixed' }}
            // 一覧（スクロールバー含む）を押しても入力欄のフォーカスを外さない（blur で閉じてクリックが届かなくなる）
            onMouseDown={(e) => e.preventDefault()}
            className="z-50 overflow-auto rounded-md border border-gray-300 bg-white py-1 text-sm shadow-lg"
          >
            {rows.map((row) =>
              row.kind === 'group' ? (
                <li
                  key={row.key}
                  role="presentation"
                  className="sticky top-0 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                >
                  {row.label}
                </li>
              ) : (
                <li
                  key={row.key}
                  id={optionId(row.index)}
                  role="option"
                  aria-selected={row.option.value === value}
                  onMouseEnter={() => setActive(row.index)}
                  onClick={() => choose(row.option)}
                  className={cn(
                    'flex cursor-pointer items-baseline gap-2 px-2 py-1',
                    row.index === active && 'bg-blue-50',
                    row.option.value === value && 'font-medium text-blue-700',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{row.option.label}</span>
                  {row.option.hint && <span className="shrink-0 text-xs text-gray-400">{row.option.hint}</span>}
                </li>
              ),
            )}
            {visible.length === 0 && (
              <li role="presentation" className="px-2 py-1 text-gray-400">
                {emptyText}
              </li>
            )}
            {hiddenCount > 0 && (
              <li role="presentation" className="px-2 py-1 text-xs text-gray-400">
                他 {hiddenCount} 件（入力で絞り込み）
              </li>
            )}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});
