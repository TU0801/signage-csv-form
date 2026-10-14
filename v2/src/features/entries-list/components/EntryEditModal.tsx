import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { entryErrorReason, updateEntryDisplaySettings } from '@/lib/api/admin-entries';
import { normalizeTerminalId } from '@/lib/terminal';
import type { DbEntry } from '@/types/database';
import {
  POSTER_POSITION_OPTIONS,
  buildEditUpdates,
  toEditForm,
  type EntryEditForm,
  type EntryEditMode,
} from '../lib/entries';

interface EntryEditModalProps {
  entry: DbEntry | null;
  mode: EntryEditMode;
  onClose: () => void;
  /** 保存後に一覧を読み直す */
  onSaved: () => void | Promise<void>;
  propertyNames: Map<string, string>;
  displayDefault: number;
}

/**
 * 表示設定だけを編集する（基本情報は参照のみ）。承認待ちからの保存は承認、取込済みの保存は未取込に戻す。
 * 値はすべて React のテキストとして描画する（v1 は innerHTML に escapeHtml して埋めていた）
 */
// v1: js/admin-entry-edit.js editEntry / saveEditedEntry
export function EntryEditModal(props: EntryEditModalProps) {
  if (!props.entry) return null;
  // 開くたびに初期値を作り直す（v1 は開くたびにモーダルを作り直していた）
  return <EntryEditDialog key={props.entry.id} {...props} entry={props.entry} />;
}

function EntryEditDialog({
  entry,
  mode,
  onClose,
  onSaved,
  propertyNames,
  displayDefault,
}: EntryEditModalProps & { entry: DbEntry }) {
  const { addToast } = useToast();
  const [form, setForm] = useState<EntryEditForm>(() => toEditForm(entry, displayDefault));
  const [saving, setSaving] = useState(false);

  const set = (key: keyof EntryEditForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateEntryDisplaySettings(
        entry.id,
        buildEditUpdates(form, mode, entry.status, displayDefault),
      );
      addToast('編集しました', 'success');
      onClose();
      await onSaved();
    } catch (error) {
      console.error('Failed to update entry:', error);
      addToast(`編集に失敗しました: ${entryErrorReason(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const propertyDisplay = `${entry.property_code || '-'} ${propertyNames.get(entry.property_code) || ''}`;

  return (
    <Modal open onClose={onClose} title="表示設定を編集" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-md bg-gray-100 p-4 text-sm">
          <h4 className="mb-3 text-sm font-bold text-gray-500">基本情報（参照のみ）</h4>
          <dl className="space-y-2">
            <InfoRow label="物件" value={propertyDisplay} />
            <InfoRow label="端末" value={normalizeTerminalId(entry.terminal_id) || '-'} />
            <InfoRow label="保守会社" value={entry.vendor_name || '-'} />
            <InfoRow label="点検種別" value={entry.inspection_type || '-'} />
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="点検開始" value={entry.inspection_start || '-'} />
              <InfoRow label="点検終了" value={entry.inspection_end || '-'} />
            </div>
          </dl>
        </div>

        <h4 className="text-sm font-bold text-gray-900">表示設定</h4>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="表示開始日"
            type="date"
            value={form.displayStartDate}
            onChange={(e) => set('displayStartDate', e.target.value)}
          />
          <Input
            label="表示開始時間"
            type="time"
            value={form.displayStartTime}
            onChange={(e) => set('displayStartTime', e.target.value)}
          />
          <Input
            label="表示終了日"
            type="date"
            value={form.displayEndDate}
            onChange={(e) => set('displayEndDate', e.target.value)}
          />
          <Input
            label="表示終了時間"
            type="time"
            value={form.displayEndTime}
            onChange={(e) => set('displayEndTime', e.target.value)}
          />
          <Input
            label="表示時間（秒）"
            type="number"
            min={1}
            max={60}
            value={form.displayDuration}
            onChange={(e) => set('displayDuration', e.target.value)}
          />
          <Select
            label="表示位置"
            options={POSTER_POSITION_OPTIONS}
            value={form.posterPosition}
            onChange={(e) => set('posterPosition', e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-gray-500">{label}：</dt>
      <dd className="truncate font-semibold text-gray-900" title={value}>
        {value}
      </dd>
    </div>
  );
}
