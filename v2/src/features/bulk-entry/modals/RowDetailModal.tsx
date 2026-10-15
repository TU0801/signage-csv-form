import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBulkStore } from '@/stores/bulkStore';
import type { BulkEntryRow, BulkNotice } from '../types';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  rowId: number | null;
}

/** 貼紙表示位置。v1: js/bulk-modals.js createRowDetailModal の detailPosition */
const POSITIONS = [
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⓪全体' },
];

// 幅を含まない基本の見た目。cn は結合だけなので w-full と w-24 を並べると CSS の並び順で w-full が勝つ（幅は使う側で 1 つだけ付ける）
const fieldBase = 'block rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none';
const field = `${fieldBase} w-full`;

/**
 * 行の詳細設定（案内文・表示期間・表示時間・貼紙表示位置）。
 * 開いたとき、案内文が空なら点検種別の定型文、表示期間が空なら点検期間を入れておく。
 * v1: js/bulk-modals.js openRowDetailModal / applyRowDetail
 */
export function RowDetailModal({ open, onClose, rowId }: RowDetailModalProps) {
  const rows = useBulkStore((s) => s.rows);
  const notices = useBulkStore((s) => s.masterData.notices);
  const index = rows.findIndex((r) => r.id === rowId);
  const row = index >= 0 ? rows[index] : undefined;

  return (
    <Modal open={open} onClose={onClose} title={`詳細設定 ${row ? `(行 ${index + 1})` : ''}`} className="max-w-2xl">
      {open && row && <RowDetailForm key={row.id} row={row} notices={notices} onClose={onClose} />}
    </Modal>
  );
}

function RowDetailForm({ row, notices, onClose }: { row: BulkEntryRow; notices: BulkNotice[]; onClose: () => void }) {
  const { addToast } = useToast();
  const applyRowDetail = useBulkStore((s) => s.applyRowDetail);

  const defaultNotice =
    row.noticeText || (row.inspectionType ? notices.find((n) => n.inspectionType === row.inspectionType)?.noticeText : '') || '';
  const [noticeText, setNoticeText] = useState(defaultNotice);
  const [displayStartDate, setDisplayStartDate] = useState(row.displayStartDate || row.startDate || '');
  const [displayStartTime, setDisplayStartTime] = useState(row.displayStartTime || '');
  const [displayEndDate, setDisplayEndDate] = useState(row.displayEndDate || row.endDate || '');
  const [displayEndTime, setDisplayEndTime] = useState(row.displayEndTime || '');
  // v1 は window.appSettings（一括入力では未設定）を見るので、行に値が無いときの既定は 6
  const [displayTime, setDisplayTime] = useState(String(row.displayTime || 6));
  const [position, setPosition] = useState(() => {
    const v = row.position !== undefined ? String(row.position) : '2';
    return POSITIONS.some((p) => p.value === v) ? v : '2';
  });

  const handleApply = () => {
    applyRowDetail(row.id, {
      noticeText,
      displayStartDate,
      displayStartTime,
      displayEndDate,
      displayEndTime,
      displayTime: parseInt(displayTime) || 6,
      position: parseInt(position),
    });
    onClose();
    addToast('詳細設定を保存しました', 'success');
  };

  return (
    <div className="space-y-3">
      <section className="space-y-1">
        <h4 className="text-sm font-semibold text-gray-800">掲示板用案内文</h4>
        <textarea
          value={noticeText}
          onChange={(e) => setNoticeText(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="例：エレベーター点検のため、一時的に停止いたします。"
          className={field}
        />
        <div className="text-right text-xs text-gray-500">{noticeText.length}/200</div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">表示期間</h4>
        <p className="text-xs text-gray-500">サイネージへの表示開始・終了日時を設定します（任意）</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-gray-700">
            <span>表示開始</span>
            <div className="flex gap-1">
              <input
                type="date"
                value={displayStartDate}
                onChange={(e) => setDisplayStartDate(e.target.value)}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              <input
                type="time"
                value={displayStartTime}
                onChange={(e) => setDisplayStartTime(e.target.value)}
                className={`${fieldBase} w-32 shrink-0`}
              />
            </div>
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>表示終了</span>
            <div className="flex gap-1">
              <input
                type="date"
                value={displayEndDate}
                onChange={(e) => setDisplayEndDate(e.target.value)}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              <input
                type="time"
                value={displayEndTime}
                onChange={(e) => setDisplayEndTime(e.target.value)}
                className={`${fieldBase} w-32 shrink-0`}
              />
            </div>
          </label>
        </div>
        <label className="block space-y-1 text-sm text-gray-700">
          <span>表示時間（秒）</span>
          <input
            type="number"
            min={1}
            max={60}
            value={displayTime}
            onChange={(e) => setDisplayTime(e.target.value)}
            className={`${fieldBase} w-24`}
          />
        </label>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">貼紙表示位置</h4>
        <div className="grid grid-cols-4 gap-2 text-sm">
          {POSITIONS.map((p) => (
            <label key={p.value} className={p.value === '0' ? 'col-span-4' : ''}>
              <input
                type="radio"
                name="detailPosition"
                value={p.value}
                checked={position === p.value}
                onChange={() => setPosition(p.value)}
                className="mr-1"
              />
              {p.label}
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleApply}>保存</Button>
      </div>
    </div>
  );
}
