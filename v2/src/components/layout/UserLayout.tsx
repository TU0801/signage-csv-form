import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { HeaderSlotContext } from './HeaderSlot';

export function UserLayout() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ target, setTarget }}>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </HeaderSlotContext.Provider>
  );
}
