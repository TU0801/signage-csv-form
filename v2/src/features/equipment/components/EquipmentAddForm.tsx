import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import type { DbInspectionType, DbVendor } from '@/types/database';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}月`,
}));

interface EquipmentAddFormProps {
  propertyCode: string;
  inspectionTypes: DbInspectionType[];
  vendors: DbVendor[];
  onAdd: (data: {
    property_code: string;
    inspection_type_id: string;
    vendor_id: string | null;
    inspection_months: number[];
    remarks: string | null;
    remarks2: string | null;
  }) => Promise<void>;
}

export function EquipmentAddForm({
  propertyCode,
  inspectionTypes,
  vendors,
  onAdd,
}: EquipmentAddFormProps) {
  const [inspectionTypeId, setInspectionTypeId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [remarks, setRemarks] = useState('');
  const [remarks2, setRemarks2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inspectionOptions = inspectionTypes.map((t) => ({
    value: t.id,
    label: t.inspection_name,
  }));

  const vendorOptions = vendors.map((v) => ({
    value: v.id,
    label: v.vendor_name,
  }));

  const toggleMonth = (month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month].sort((a, b) => a - b),
    );
  };

  const handleSubmit = async () => {
    if (!inspectionTypeId) return;
    setSubmitting(true);
    try {
      await onAdd({
        property_code: propertyCode,
        inspection_type_id: inspectionTypeId,
        vendor_id: vendorId || null,
        inspection_months: selectedMonths,
        remarks: remarks || null,
        remarks2: remarks2 || null,
      });
      setInspectionTypeId('');
      setVendorId('');
      setSelectedMonths([]);
      setRemarks('');
      setRemarks2('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 border rounded-md p-4 bg-gray-50">
      <h4 className="text-sm font-medium text-gray-700">設備追加</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="点検種別"
          options={inspectionOptions}
          value={inspectionTypeId}
          onChange={(e) => setInspectionTypeId(e.target.value)}
          placeholder="選択してください"
          required
        />
        <Select
          label="保守会社"
          options={vendorOptions}
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          placeholder="選択してください"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">点検月</label>
        <div className="flex flex-wrap gap-2">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => toggleMonth(Number(m.value))}
              className={`px-2 py-1 text-xs rounded border ${
                selectedMonths.includes(Number(m.value))
                  ? 'bg-blue-100 border-blue-400 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="備考"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
        <Input
          label="備考2"
          value={remarks2}
          onChange={(e) => setRemarks2(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={!inspectionTypeId || submitting} size="sm">
          {submitting ? '追加中...' : '追加'}
        </Button>
      </div>
    </div>
  );
}
