import type { DbAdSlot } from '@/types/database';

interface AdSlotCardProps {
  slotIndex: number;
  slot: DbAdSlot | undefined;
  onOpen: (slotIndex: number) => void;
}

/** 広告枠1つ分のセル（サムネイル・枠番号・表示中/非表示・キャプション）。押すと編集を開く */
// v1: js/admin-masters-ads.js renderAdSlotsGrid の adCells
export function AdSlotCard({ slotIndex, slot, onOpen }: AdSlotCardProps) {
  const isActive = !!slot?.is_active;
  return (
    <button
      type="button"
      onClick={() => onOpen(slotIndex)}
      className="flex flex-col overflow-hidden rounded-lg bg-white text-left transition-shadow hover:shadow-md"
      aria-label={`広告枠 ${slotIndex} を編集`}
    >
      {/* ログイン画面のセル（PC で横:縦 ≒ 2:1）に合わせ、切らずに全体を出す（ログイン画面の AdSlotCell と同じ contain） */}
      <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden bg-slate-100">
        {slot?.image_url && (
          <img src={slot.image_url} alt="" className="h-full w-full object-contain" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
          {slotIndex}
        </span>
        <span
          className={
            'absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold ' +
            (isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400')
          }
        >
          {isActive ? '表示中' : '非表示'}
        </span>
      </div>
      <div className="border-t border-slate-100 bg-white px-3 py-2">
        <p
          className={
            'truncate text-xs ' + (slot?.caption ? 'text-slate-600' : 'text-slate-300')
          }
        >
          {slot?.caption || 'キャプションなし'}
        </p>
      </div>
    </button>
  );
}
