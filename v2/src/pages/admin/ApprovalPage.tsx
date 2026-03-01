import { PendingEntriesList } from '@/features/approval/components/PendingEntriesList';
import { BuildingRequestsList } from '@/features/approval/components/BuildingRequestsList';

export function ApprovalPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">承認管理</h1>
      <PendingEntriesList />
      <BuildingRequestsList />
    </div>
  );
}
