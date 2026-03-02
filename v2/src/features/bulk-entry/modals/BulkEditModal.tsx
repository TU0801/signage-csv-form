import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useBulkStore } from '@/stores/bulkStore';
import type { EntryFormData } from '@/types/app';
import { useMasterData } from '@/hooks/useMasterData';
import { buildTerminalOptions } from '../utils/buildTerminalOptions';

interface BulkEditModalProps {
  open: boolean;
  onClose: () => void;
}

type EditableField = {
  key: keyof EntryFormData;
  label: string;
  type: 'text' | 'date' | 'select';
};

const EDITABLE_FIELDS: EditableField[] = [
  { key: 'propertyCode', label: '物件コード', type: 'select' },
  { key: 'terminalId', label: '端末ID', type: 'select' },
  { key: 'vendorName', label: '保守会社名', type: 'select' },
  { key: 'inspectionType', label: '点検種別', type: 'select' },
  { key: 'startDate', label: '開始日', type: 'date' },
  { key: 'endDate', label: '終了日', type: 'date' },
  { key: 'displayStartDate', label: '表示開始日', type: 'date' },
  { key: 'displayEndDate', label: '表示終了日', type: 'date' },
  { key: 'remarks', label: '備考', type: 'text' },
];

export function BulkEditModal({ open, onClose }: BulkEditModalProps) {
  const selectedIds = useBulkStore((s) => s.selectedIds);
  const bulkUpdateField = useBulkStore((s) => s.bulkUpdateField);
  const { properties, vendors, inspectionTypes } = useMasterData();
  const [selectedField, setSelectedField] = useState<keyof EntryFormData | ''>('');
  const [value, setValue] = useState('');
  const [selectedPropertyCode, setSelectedPropertyCode] = useState('');

  const ids = [...selectedIds];

  const handleApply = () => {
    if (!selectedField || ids.length === 0) return;
    bulkUpdateField(ids, selectedField, value);
    onClose();
    setSelectedField('');
    setValue('');
    setSelectedPropertyCode('');
  };

  const handleClose = () => {
    setSelectedField('');
    setValue('');
    setSelectedPropertyCode('');
    onClose();
  };

  const currentField = EDITABLE_FIELDS.find((f) => f.key === selectedField);

  const getOptions = (field: keyof EntryFormData) => {
    switch (field) {
      case 'propertyCode':
        return properties.map((p) => ({
          value: p.property_code,
          label: `${p.property_code} - ${p.property_name}`,
        }));
      case 'terminalId': {
        const prop = properties.find((p) => p.property_code === selectedPropertyCode);
        return buildTerminalOptions(prop?.terminals ?? []);
      }
      case 'vendorName':
        return vendors.map((v) => ({
          value: v.vendor_name,
          label: v.vendor_name,
        }));
      case 'inspectionType':
        return inspectionTypes.map((t) => ({
          value: t.inspection_name,
          label: t.inspection_name,
        }));
      default:
        return [];
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="一括編集">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          選択した{ids.length}件の行を一括で編集します。
        </p>

        <Select
          label="編集するフィールド"
          value={selectedField}
          onChange={(e) => {
            setSelectedField(e.target.value as keyof EntryFormData);
            setValue('');
          }}
          options={EDITABLE_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
          placeholder="フィールドを選択"
        />

        {currentField && (
          <div className="space-y-3">
            {currentField.key === 'terminalId' && (
              <Select
                label="対象物件を選択"
                value={selectedPropertyCode}
                onChange={(e) => {
                  setSelectedPropertyCode(e.target.value);
                  setValue('');
                }}
                options={properties.map((p) => ({
                  value: p.property_code,
                  label: `${p.property_code} - ${p.property_name}`,
                }))}
                placeholder="物件を選択してください"
              />
            )}
            {currentField.type === 'select' ? (
              <Select
                label={`新しい値: ${currentField.label}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                options={getOptions(currentField.key)}
                placeholder="選択してください"
              />
            ) : (
              <Input
                label={`新しい値: ${currentField.label}`}
                type={currentField.type}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleApply} disabled={!selectedField}>
            適用 ({ids.length}件)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
