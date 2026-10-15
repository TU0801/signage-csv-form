import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader, type LayoutWidth } from './AppHeader';
import { HeaderSlotContext } from './HeaderSlot';

export function UserLayout({ width = 'standard' }: { width?: LayoutWidth }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ target, setTarget }}>
      <div className="min-h-screen bg-gray-50">
        <AppHeader width={width} />
        <main className={width === 'full' ? 'max-w-none p-0' : 'max-w-[1800px] mx-auto px-3 lg:px-4 py-3'}>
          <Outlet />
        </main>
      </div>
    </HeaderSlotContext.Provider>
  );
}
