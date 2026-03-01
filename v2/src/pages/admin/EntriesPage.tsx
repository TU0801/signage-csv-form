import { EntriesTable } from '@/features/entries-list/components/EntriesTable';

export function EntriesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">データ一覧</h1>
      <EntriesTable />
    </div>
  );
}
