import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MAX_EXTRA_POSTERS } from '@/lib/extraPosters';
import type { PosterLibraryItem } from '@/lib/api/poster-library';
import { LibraryPickerModal } from './LibraryPickerModal';

/** 一覧に出す追加の貼紙1枚 */
export interface ExtraPosterView {
  key: string;
  /** サムネイルの URL（data URL か poster-images の公開 URL）。出せなければ null */
  url: string | null;
  /** 名前（ライブラリの名前・ファイル名） */
  label: string;
  /** 表示位置（'0'〜'4'）。null は申請の貼紙表示位置と同じ */
  position: string | null;
}

interface ExtraPostersEditorProps {
  items: ExtraPosterView[];
  /** ライブラリを絞る物件 */
  propertyCode: string;
  /** アップロード中など（追加のボタンを止める） */
  busy?: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onPickLibrary: (item: PosterLibraryItem) => void;
  onRemove: (index: number) => void;
  onPositionChange: (index: number, position: string | null) => void;
}

const POSITION_CHOICES = [
  { value: '', label: '位置: 1枚目と同じ' },
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⓪全体' },
];

/**
 * 2枚目以降の貼紙（修正依頼1025 D3）。「＋貼紙を追加」でアップロードかライブラリから選ぶ。
 * CSV では枚数分の行になり（貼紙区分「追加」）、追加画像 ZIP にも入る。1件入力と一括入力の詳細設定で共通に使う
 */
export function ExtraPostersEditor({
  items,
  propertyCode,
  busy = false,
  onUpload,
  onPickLibrary,
  onRemove,
  onPositionChange,
}: ExtraPostersEditorProps) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = items.length >= MAX_EXTRA_POSTERS;

  return (
    <div className="space-y-1" data-testid="extra-posters-editor">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-gray-600">
          追加の貼紙（2枚目以降）{items.length > 0 ? `${items.length}枚` : ''}
        </span>
        <input
          ref={fileRef}
          id={`${uid}-file`}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          className="hidden"
          aria-label="追加の貼紙の画像"
          onChange={(e) => {
            const input = e.target;
            const file = input.files?.[0];
            input.value = '';
            if (file) void onUpload(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || full}
          onClick={() => fileRef.current?.click()}
        >
          ＋貼紙を追加（アップロード）
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || full}
          onClick={() => setPickerOpen(true)}
        >
          ＋ライブラリから追加
        </Button>
        {full && <span className="text-xs text-gray-500">上限 {MAX_EXTRA_POSTERS} 枚</span>}
      </div>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {items.map((item, i) => (
            <li key={item.key} className="flex gap-1.5 rounded border border-gray-200 p-1">
              {item.url ? (
                <img
                  src={item.url}
                  alt={`${i + 2}枚目のサムネイル`}
                  className="h-16 w-12 shrink-0 rounded bg-white object-contain"
                />
              ) : (
                <span className="flex h-16 w-12 shrink-0 items-center justify-center text-[10px] text-red-600">
                  表示不可
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="truncate text-xs text-gray-800" title={item.label}>
                  {i + 2}枚目 {item.label}
                </div>
                <select
                  aria-label={`${i + 2}枚目の表示位置`}
                  value={item.position ?? ''}
                  onChange={(e) => onPositionChange(i, e.target.value || null)}
                  className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs"
                >
                  {POSITION_CHOICES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="text-xs text-red-600 hover:underline"
                  aria-label={`${i + 2}枚目の貼紙を外す`}
                >
                  外す
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && (
        <LibraryPickerModal
          open
          propertyCode={propertyCode}
          onClose={() => setPickerOpen(false)}
          onSelect={(item) => {
            setPickerOpen(false);
            onPickLibrary(item);
          }}
        />
      )}
    </div>
  );
}
