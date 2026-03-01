import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Button } from '@/components/ui/Button';
import { EntryStatus, PosterType } from '@/lib/constants';
import type { DbEntry } from '@/types/database';

interface EntryEditModalProps {
  open: boolean;
  onClose: () => void;
  entry: DbEntry | null;
  onSave: (id: string, updates: Partial<DbEntry>) => Promise<void>;
}

const statusOptions = [
  { value: EntryStatus.PENDING, label: 'pending' },
  { value: EntryStatus.DRAFT, label: 'draft' },
  { value: EntryStatus.READY, label: 'ready' },
  { value: EntryStatus.EXPORTED, label: 'exported' },
];

const posterTypeOptions = [
  { value: PosterType.TEMPLATE, label: 'テンプレート' },
  { value: PosterType.CUSTOM, label: '追加' },
];

export function EntryEditModal({ open, onClose, entry, onSave }: EntryEditModalProps) {
  const [formData, setFormData] = useState<Partial<DbEntry>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setFormData({
        property_code: entry.property_code,
        terminal_id: entry.terminal_id,
        vendor_name: entry.vendor_name,
        emergency_contact: entry.emergency_contact,
        inspection_type: entry.inspection_type,
        template_no: entry.template_no,
        inspection_start: entry.inspection_start,
        inspection_end: entry.inspection_end,
        display_start_date: entry.display_start_date,
        display_start_time: entry.display_start_time,
        display_end_date: entry.display_end_date,
        display_end_time: entry.display_end_time,
        display_duration: entry.display_duration,
        announcement: entry.announcement,
        remarks: entry.remarks,
        poster_type: entry.poster_type,
        frame_no: entry.frame_no,
        status: entry.status,
      });
    }
  }, [entry]);

  const handleChange = (field: keyof DbEntry, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setSaving(true);
    try {
      await onSave(entry.id, formData);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!entry) return null;

  return (
    <Modal open={open} onClose={onClose} title="エントリー編集" className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="物件コード"
            value={formData.property_code ?? ''}
            onChange={(e) => handleChange('property_code', e.target.value)}
          />
          <Input
            label="端末ID"
            value={formData.terminal_id ?? ''}
            onChange={(e) => handleChange('terminal_id', e.target.value)}
          />
          <Input
            label="保守会社"
            value={formData.vendor_name ?? ''}
            onChange={(e) => handleChange('vendor_name', e.target.value)}
          />
          <Input
            label="緊急連絡先"
            value={formData.emergency_contact ?? ''}
            onChange={(e) => handleChange('emergency_contact', e.target.value || null)}
          />
          <Input
            label="点検種別"
            value={formData.inspection_type ?? ''}
            onChange={(e) => handleChange('inspection_type', e.target.value)}
          />
          <Input
            label="テンプレートNo"
            value={formData.template_no ?? ''}
            onChange={(e) => handleChange('template_no', e.target.value || null)}
          />
          <Input
            label="点検開始日"
            type="date"
            value={formData.inspection_start ?? ''}
            onChange={(e) => handleChange('inspection_start', e.target.value || null)}
          />
          <Input
            label="点検終了日"
            type="date"
            value={formData.inspection_end ?? ''}
            onChange={(e) => handleChange('inspection_end', e.target.value || null)}
          />
          <Input
            label="表示開始日"
            type="date"
            value={formData.display_start_date ?? ''}
            onChange={(e) => handleChange('display_start_date', e.target.value || null)}
          />
          <Input
            label="表示終了日"
            type="date"
            value={formData.display_end_date ?? ''}
            onChange={(e) => handleChange('display_end_date', e.target.value || null)}
          />
          <Input
            label="表示開始時刻"
            type="time"
            value={formData.display_start_time ?? ''}
            onChange={(e) => handleChange('display_start_time', e.target.value || null)}
          />
          <Input
            label="表示終了時刻"
            type="time"
            value={formData.display_end_time ?? ''}
            onChange={(e) => handleChange('display_end_time', e.target.value || null)}
          />
          <Input
            label="表示時間(秒)"
            type="number"
            value={formData.display_duration ?? ''}
            onChange={(e) =>
              handleChange(
                'display_duration',
                e.target.value ? Number(e.target.value) : null,
              )
            }
          />
          <Input
            label="フレームNo"
            value={formData.frame_no ?? ''}
            onChange={(e) => handleChange('frame_no', e.target.value || null)}
          />
          <Select
            label="貼紙区分"
            options={posterTypeOptions}
            placeholder="選択"
            value={formData.poster_type ?? ''}
            onChange={(e) =>
              handleChange('poster_type', (e.target.value || null) as DbEntry['poster_type'])
            }
          />
          <Select
            label="ステータス"
            options={statusOptions}
            value={formData.status ?? ''}
            onChange={(e) =>
              handleChange('status', (e.target.value || null) as DbEntry['status'])
            }
          />
        </div>
        <TextArea
          label="案内文"
          value={formData.announcement ?? ''}
          onChange={(e) => handleChange('announcement', e.target.value || null)}
          rows={3}
        />
        <TextArea
          label="備考"
          value={formData.remarks ?? ''}
          onChange={(e) => handleChange('remarks', e.target.value || null)}
          rows={2}
        />
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
