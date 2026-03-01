import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMasterData } from '@/hooks/useMasterData';
import { useEquipment } from '../hooks/useEquipment';
import { EquipmentTable } from './EquipmentTable';
import { EquipmentAddForm } from './EquipmentAddForm';

export function EquipmentPanel() {
  const { addToast } = useToast();
  const { properties, vendors, inspectionTypes, loading: masterLoading } = useMasterData();
  const [selectedProperty, setSelectedProperty] = useState('');

  const { items, loading, error, addItem, deleteItem } = useEquipment(selectedProperty);

  const propertyOptions = properties.map((p) => ({
    value: p.property_code,
    label: `${p.property_code} - ${p.property_name}`,
  }));

  const handleAdd = async (data: Parameters<typeof addItem>[0]) => {
    try {
      await addItem(data);
      addToast('設備を追加しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '追加に失敗しました', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      addToast('設備を削除しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    }
  };

  if (masterLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Select
          label="物件を選択"
          options={propertyOptions}
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          placeholder="物件を選択してください"
        />
      </div>

      {selectedProperty && (
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-gray-900">
              設備一覧 ({items.length}件)
            </h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <EquipmentTable
                items={items}
                inspectionTypes={inspectionTypes}
                vendors={vendors}
                onDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>
      )}

      {selectedProperty && (
        <EquipmentAddForm
          propertyCode={selectedProperty}
          inspectionTypes={inspectionTypes}
          vendors={vendors}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
