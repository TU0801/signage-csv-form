import { InspectionPortal } from '@/features/inspection-portal/components/InspectionPortal';

/** 点検一覧（管理会社・保守会社・管理者）。実装は features/inspection-portal */
export function PortalPage() {
  // ルートは全幅（UserLayout width="full" は余白を持たない）なので、ここで左右の余白を付ける
  return (
    <div className="px-3 py-2">
      <InspectionPortal />
    </div>
  );
}
