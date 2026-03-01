import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useBulkStore } from '@/stores/bulkStore';
import { useMasterData } from '@/hooks/useMasterData';
import type { EntryFormData } from '@/types/app';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  rowId: string | null;
}

export function RowDetailModal({ open, onClose, rowId }: RowDetailModalProps) {
  const rows = useBulkStore((s) => s.rows);
  const updateRow = useBulkStore((s) => s.updateRow);
  const { properties, vendors, inspectionTypes } = useMasterData();

  const row = rowId ? rows.find((r) => r._id === rowId) : undefined;

  if (!row) {
    return (
      <Modal open={open} onClose={onClose} title="行詳細">
        <p className="text-sm text-gray-500">行が見つかりません</p>
      </Modal>
    );
  }

  const handleChange = (field: keyof EntryFormData, value: unknown) => {
    updateRow(row._id, { [field]: value });
  };

  const propertyOptions = properties.map((p) => ({
    value: p.property_code,
    label: `${p.property_code} - ${p.property_name}`,
  }));

  const vendorOptions = vendors.map((v) => ({
    value: v.vendor_name,
    label: v.vendor_name,
  }));

  const inspectionOptions = inspectionTypes.map((t) => ({
    value: t.inspection_name,
    label: t.inspection_name,
  }));

  const errorKeys = Object.keys(row._errors);

  return (
    <Modal open={open} onClose={onClose} title="行詳細編集" className="max-w-2xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {/* Status */}
        <div className="flex items-center gap-2">
          <Badge variant={row._isValid ? 'success' : 'danger'}>
            {row._isValid ? '有効' : 'エラーあり'}
          </Badge>
          {errorKeys.length > 0 && (
            <span className="text-xs text-red-600">
              {errorKeys.length}件のエラー
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="物件コード"
            value={row.propertyCode}
            onChange={(e) => handleChange('propertyCode', e.target.value)}
            options={propertyOptions}
            placeholder="選択してください"
            error={row._errors['propertyCode']}
          />
          <Input
            label="端末ID"
            value={row.terminalId}
            onChange={(e) => handleChange('terminalId', e.target.value)}
            error={row._errors['terminalId']}
          />
          <Select
            label="保守会社名"
            value={row.vendorName}
            onChange={(e) => handleChange('vendorName', e.target.value)}
            options={vendorOptions}
            placeholder="選択してください"
            error={row._errors['vendorName']}
          />
          <Input
            label="緊急連絡先"
            value={row.emergencyContact}
            onChange={(e) => handleChange('emergencyContact', e.target.value)}
          />
          <Select
            label="点検種別"
            value={row.inspectionType}
            onChange={(e) => handleChange('inspectionType', e.target.value)}
            options={inspectionOptions}
            placeholder="選択してください"
            error={row._errors['inspectionType']}
          />
          <Input
            label="テンプレートNo"
            value={row.templateNo}
            onChange={(e) => handleChange('templateNo', e.target.value)}
          />
          <Input
            label="開始日"
            type="date"
            value={row.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            error={row._errors['startDate']}
          />
          <Input
            label="終了日"
            type="date"
            value={row.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            error={row._errors['endDate']}
          />
          <Input
            label="表示開始日"
            type="date"
            value={row.displayStartDate}
            onChange={(e) => handleChange('displayStartDate', e.target.value)}
            error={row._errors['displayStartDate']}
          />
          <Input
            label="表示終了日"
            type="date"
            value={row.displayEndDate}
            onChange={(e) => handleChange('displayEndDate', e.target.value)}
            error={row._errors['displayEndDate']}
          />
          <Input
            label="表示開始時刻"
            type="time"
            value={row.displayStartTime}
            onChange={(e) => handleChange('displayStartTime', e.target.value)}
          />
          <Input
            label="表示終了時刻"
            type="time"
            value={row.displayEndTime}
            onChange={(e) => handleChange('displayEndTime', e.target.value)}
          />
          <Input
            label="表示時間（秒）"
            type="number"
            value={row.displayDuration}
            onChange={(e) => handleChange('displayDuration', Number(e.target.value))}
            error={row._errors['displayDuration']}
          />
          <Input
            label="Frame No"
            value={row.frameNo}
            onChange={(e) => handleChange('frameNo', e.target.value)}
          />
          <Select
            label="貼紙区分"
            value={row.posterType}
            onChange={(e) =>
              handleChange('posterType', e.target.value as 'template' | 'custom')
            }
            options={[
              { value: 'template', label: 'テンプレート' },
              { value: 'custom', label: '追加（カスタム）' },
            ]}
          />
          <Input
            label="貼紙位置"
            value={row.posterPosition}
            onChange={(e) => handleChange('posterPosition', e.target.value)}
          />
        </div>

        <TextArea
          label="案内文"
          value={row.noticeText}
          onChange={(e) => handleChange('noticeText', e.target.value)}
          rows={3}
        />
        <TextArea
          label="備考"
          value={row.remarks}
          onChange={(e) => handleChange('remarks', e.target.value)}
          rows={2}
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showOnBoard"
            checked={row.showOnBoard}
            onChange={(e) => handleChange('showOnBoard', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="showOnBoard" className="text-sm text-gray-700">
            掲示板に表示する
          </label>
        </div>

        {/* Error list */}
        {errorKeys.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800 mb-1">エラー一覧</p>
            <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
              {errorKeys.map((key) => (
                <li key={key}>{row._errors[key]}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </Modal>
  );
}
