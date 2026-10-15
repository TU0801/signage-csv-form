import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';

export function AdminLayout() {
  return (
    <div className="flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-3 2xl:p-4">
        <Outlet />
      </main>
    </div>
  );
}
