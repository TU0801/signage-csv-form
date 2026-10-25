import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { safePosterUrl } from '@/lib/posterUrl';
import { fetchLibraryForProperty, type PosterLibraryItem } from '@/lib/api/poster-library';

interface LibraryPickerModalProps {
  open: boolean;
  /** 申請する物件（その物件の管理会社の分と全社共通を出す。空なら全社共通だけ） */
  propertyCode: string;
  onClose: () => void;
  onSelect: (item: PosterLibraryItem) => void;
}

const ALL = '';

/**
 * 貼紙ライブラリから1枚選ぶ（修正依頼1025 D2）。カテゴリのタブと名前の検索で絞り、画像をクリックして選ぶ。
 * 1件入力・一括入力の詳細設定で共通に使う
 */
export function LibraryPickerModal({
  open,
  propertyCode,
  onClose,
  onSelect,
}: LibraryPickerModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="貼紙ライブラリから選ぶ" className="max-w-4xl">
      {open && <PickerBody propertyCode={propertyCode} onSelect={onSelect} />}
    </Modal>
  );
}

function PickerBody({
  propertyCode,
  onSelect,
}: {
  propertyCode: string;
  onSelect: (item: PosterLibraryItem) => void;
}) {
  const [items, setItems] = useState<PosterLibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchLibraryForProperty(propertyCode)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => {
        console.error('貼紙ライブラリの取得に失敗しました:', e);
        if (!cancelled) setError('貼紙ライブラリを読み込めませんでした');
      });
    return () => {
      cancelled = true;
    };
  }, [propertyCode]);

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);
  const shown = (items ?? []).filter(
    (i) =>
      (category === ALL || i.category === category) &&
      (!query || i.display_name.includes(query.trim())),
  );

  if (error) return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  if (!items) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        選べる貼紙がありません（管理者・管理会社がマスター管理の「貼紙ライブラリ」で登録します）
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {[ALL, ...categories].map((c) => (
          <button
            key={c || 'all'}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              category === c
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            )}
          >
            {c || 'すべて'}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索"
          aria-label="貼紙の名前で検索"
          className="ml-auto w-40 rounded-md border border-gray-300 px-2 py-0.5 text-sm"
        />
      </div>
      <p className="text-xs text-gray-500">
        画像をクリックすると選びます。文字は合成されず、画像のままサイネージに出ます（CSV
        の貼紙区分は「追加」）。
        {propertyCode ? '' : '物件を選ぶと、その物件の管理会社の貼紙も出ます。'}
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((item) => {
          const url = safePosterUrl(item.image_url);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full flex-col items-center gap-0.5 rounded border border-gray-200 p-1 text-xs hover:border-blue-500 hover:bg-blue-50"
                title={`${item.category} / ${item.display_name}`}
              >
                {url ? (
                  <img
                    src={url}
                    alt={item.display_name}
                    loading="lazy"
                    className="h-28 w-full object-contain"
                  />
                ) : (
                  <span className="flex h-28 items-center text-red-600">表示できない URL</span>
                )}
                <span className="w-full truncate text-gray-800">{item.display_name}</span>
                <span className="w-full truncate text-[10px] text-gray-500">
                  {item.category}
                  {item.management_company_id ? '・管理会社' : '・共通'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && (
        <p className="py-3 text-center text-sm text-gray-500">当てはまる貼紙がありません</p>
      )}
    </div>
  );
}
