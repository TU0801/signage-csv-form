import { useState, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useMasterData } from '@/hooks/useMasterData';
import { EntryForm } from '@/features/single-entry/components/EntryForm';
import { EntryDataList, type LocalEntry } from '@/features/single-entry/components/EntryDataList';
import { CsvActions } from '@/features/single-entry/components/CsvActions';

export function SingleEntryPage() {
  const { properties, vendors, inspectionTypes, categories, loading, error } = useMasterData();
  const [entries, setEntries] = useState<LocalEntry[]>([]);

  const handleAddEntry = useCallback((entry: LocalEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const handleRemoveEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e._id !== id));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const masterData = { properties, vendors, inspectionTypes, categories };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">1件入力</h1>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-800">データ入力</h2>
        </CardHeader>
        <CardContent>
          <EntryForm masterData={masterData} onAddEntry={handleAddEntry} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              追加済みデータ ({entries.length}件)
            </h2>
            <CsvActions entries={entries} />
          </div>
        </CardHeader>
        <CardContent>
          <EntryDataList entries={entries} onRemove={handleRemoveEntry} />
        </CardContent>
      </Card>
    </div>
  );
}
