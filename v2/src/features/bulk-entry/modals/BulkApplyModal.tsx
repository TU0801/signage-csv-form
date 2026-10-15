import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useBulkStore, type BulkRowsPatch } from '@/stores/bulkStore';
import { POSITIONS } from '../utils/rowDetail';

interface BulkApplyModalProps {
  open: boolean;
  onClose: () => void;
  /** 入れる項目だけを渡す（空の項目は行ごとの値のまま） */
  onApply: (patch: BulkRowsPatch) => void;
  selectedCount: number;
}

const fieldBase = 'block rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none';
const labelText = 'block text-xs font-medium text-gray-600';

/**
 * 選択した行に同じ点検種別・点検日・表示期間・表示時間・貼紙表示位置をまとめて入れる。
 * 同じ点検を何十物件にも出すとき、行ごとにセルや詳細設定を開かずに済むようにする。
 */
export function BulkApplyModal(props: BulkApplyModalProps) {
  // 開くたびに入力を空から始める
  return props.open ? <BulkApplyForm {...props} /> : null;
}

function BulkApplyForm({ onClose, onApply, selectedCount }: BulkApplyModalProps) {
  const notices = useBulkStore((s) => s.masterData.notices);
  const [inspectionType, setInspectionType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [displayStartDate, setDisplayStartDate] = useState('');
  const [displayStartTime, setDisplayStartTime] = useState('');
  const [displayEndDate, setDisplayEndDate] = useState('');
  const [displayEndTime, setDisplayEndTime] = useState('');
  const [displayTime, setDisplayTime] = useState('');
  const [position, setPosition] = useState('');

  const inspectionOptions = useMemo(
    () => [{ value: '', label: '変更しない' }, ...notices.map((n) => ({ value: n.inspectionType, label: n.inspectionType }))],
    [notices],
  );

  const patch: BulkRowsPatch = {};
  if (inspectionType) patch.inspectionType = inspectionType;
  if (startDate) patch.startDate = startDate;
  if (endDate) patch.endDate = endDate;
  if (displayStartDate) patch.displayStartDate = displayStartDate;
  if (displayStartTime) patch.displayStartTime = displayStartTime;
  if (displayEndDate) patch.displayEndDate = displayEndDate;
  if (displayEndTime) patch.displayEndTime = displayEndTime;
  if (parseInt(displayTime) > 0) patch.displayTime = parseInt(displayTime);
  if (position) patch.position = parseInt(position);
  const changed = Object.keys(patch).length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      dirty={changed}
      title={`選択行に一括設定（${selectedCount}行）`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={() => onApply(patch)} disabled={!changed}>
            {selectedCount}行に入れる
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          入力した項目だけを選択中の行に上書きします。空のままの項目は行ごとの値を変えません。
        </p>

        <Combobox
          label="点検種別"
          value={inspectionType}
          options={inspectionOptions}
          onChange={setInspectionType}
          placeholder="変更しない"
          data-autofocus
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-0.5">
            <span className={labelText}>点検開始日</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${fieldBase} w-full`} />
          </label>
          <label className="space-y-0.5">
            <span className={labelText}>点検終了日</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${fieldBase} w-full`} />
          </label>
        </div>
        <p className="text-xs text-gray-500">点検終了日が空の行は、点検開始日を入れると同じ日になります（表のセルで入れたときと同じ）。</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <span className={labelText}>表示開始</span>
            <div className="flex gap-1">
              <input
                type="date"
                aria-label="表示開始日"
                value={displayStartDate}
                onChange={(e) => setDisplayStartDate(e.target.value)}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              <input
                type="time"
                aria-label="表示開始時刻"
                value={displayStartTime}
                onChange={(e) => setDisplayStartTime(e.target.value)}
                className={`${fieldBase} w-28 shrink-0`}
              />
            </div>
          </div>
          <div className="space-y-0.5">
            <span className={labelText}>表示終了</span>
            <div className="flex gap-1">
              <input
                type="date"
                aria-label="表示終了日"
                value={displayEndDate}
                onChange={(e) => setDisplayEndDate(e.target.value)}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              <input
                type="time"
                aria-label="表示終了時刻"
                value={displayEndTime}
                onChange={(e) => setDisplayEndTime(e.target.value)}
                className={`${fieldBase} w-28 shrink-0`}
              />
            </div>
          </div>
        </div>

        <label className="block space-y-0.5">
          <span className={labelText}>表示時間（秒）</span>
          <input
            type="number"
            min={1}
            max={60}
            value={displayTime}
            placeholder="変更しない"
            onChange={(e) => setDisplayTime(e.target.value)}
            className={`${fieldBase} w-32`}
          />
        </label>

        <fieldset className="space-y-1">
          <legend className={labelText}>貼紙表示位置</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[{ value: '', label: '変更しない' }, ...POSITIONS].map((p) => (
              <label key={p.value || 'keep'}>
                <input
                  type="radio"
                  name="bulkApplyPosition"
                  value={p.value}
                  checked={position === p.value}
                  onChange={() => setPosition(p.value)}
                  className="mr-1"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
