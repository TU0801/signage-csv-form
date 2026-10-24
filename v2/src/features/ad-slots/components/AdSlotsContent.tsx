import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MAX_AD_SLOTS } from '@/lib/constants';
import { useAdSlots } from '../hooks/useAdSlots';
import { AdSlotCard } from './AdSlotCard';
import { AdSlotModal } from './AdSlotModal';
import type { DbAdSlot } from '@/types/database';

const SLOT_INDEXES = Array.from({ length: MAX_AD_SLOTS }, (_, i) => i + 1);

/**
 * ログイン画面と同じ 2×2 の並び（左上がログイン欄で固定、残り3つが広告枠）。
 * 枠は配列の位置ではなく slot_index で置く。枠の行は DB に既にある（v1 は UPDATE だけで INSERT しない）。
 */
// v1: js/admin-masters-ads.js initAdSlotsAdmin / renderAdSlotsGrid（admin.html #tab-ads）
export function AdSlotsContent() {
  const { slots, loading, error, saveSlot, clearSlot } = useAdSlots();
  const [editing, setEditing] = useState<DbAdSlot | null>(null);

  const slotMap = new Map(slots.map((s) => [s.slot_index, s]));

  // v1: js/admin-masters-ads.js window.openAdSlotModal（行が無い枠は開かない）
  const openSlot = (slotIndex: number) => {
    const slot = slotMap.get(slotIndex);
    if (slot) setEditing(slot);
  };

  if (loading && slots.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-bold text-gray-900">広告枠管理</h1>
        <p className="text-sm text-gray-500">ログイン画面の広告枠（3枠）を管理します</p>
      </div>

      {error && <p className="text-sm text-red-600">広告枠の読み込みに失敗しました: {error}</p>}

      <div className="grid max-w-2xl grid-cols-2 gap-1.5 rounded-2xl bg-slate-200 p-2">
        <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-indigo-400 to-purple-700">
          <div className="p-4 text-center text-white">
            <div className="text-xs font-semibold opacity-90">ログイン画面</div>
            <div className="mt-1 text-[0.625rem] opacity-70">（変更不可）</div>
          </div>
        </div>
        {SLOT_INDEXES.map((idx) => (
          <AdSlotCard key={idx} slotIndex={idx} slot={slotMap.get(idx)} onOpen={openSlot} />
        ))}
      </div>

      {/* 開くたびに作り直して、前回選んだファイルを残さない（v1 は開くときに file input を空にする） */}
      <AdSlotModal
        key={editing?.id ?? 'closed'}
        slot={editing}
        onClose={() => setEditing(null)}
        onSave={saveSlot}
        onClear={clearSlot}
      />
    </div>
  );
}
