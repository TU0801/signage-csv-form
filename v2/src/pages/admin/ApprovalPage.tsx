import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PendingEntriesList } from '@/features/approval/components/PendingEntriesList';
import { BuildingRequestsList } from '@/features/approval/components/BuildingRequestsList';

type ApprovalTab = 'data' | 'buildings';

const TABS: { key: ApprovalTab; label: string }[] = [
  { key: 'data', label: 'データ承認' },
  { key: 'buildings', label: 'ビル追加' },
];

/** 承認待ち（データ承認 / ビル追加のサブタブ） */
// v1: admin.html .admin-tab[data-approval-type] / js/admin.js 承認待ちサブタブ切り替え
export function ApprovalPage() {
  const [tab, setTab] = useState<ApprovalTab>('data');
  return (
    <div className="space-y-3">
      <h1 className="text-base font-bold text-gray-900">承認待ち</h1>
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-1.5 text-sm font-medium',
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'data' ? <PendingEntriesList /> : <BuildingRequestsList />}
    </div>
  );
}
