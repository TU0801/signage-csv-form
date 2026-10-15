import { EntriesTable } from '@/features/entries-list/components/EntriesTable';

export function EntriesPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-base font-bold text-gray-900">承認済み</h1>
      <EntriesTable />
    </div>
  );
}
