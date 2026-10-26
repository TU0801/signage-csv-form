import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const auth = vi.hoisted(() => ({ isManagement: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/features/inspection-portal/components/InspectionPortal', () => ({ InspectionPortal: () => <p>点検一覧の画面</p> }));
vi.mock('@/pages/BulkEntryPage', () => ({
  BulkEntryPage: ({ modeSwitch }: { modeSwitch: ReactNode }) => (
    <div>
      {modeSwitch}
      <p>一括入力の画面</p>
    </div>
  ),
}));
vi.mock('@/pages/ReportCheckPage', () => ({
  ReportCheckPage: ({ modeSwitch }: { modeSwitch: ReactNode }) => (
    <div>
      {modeSwitch}
      <p>報告書確認の画面</p>
    </div>
  ),
}));
vi.mock('@/pages/SingleEntryPage', () => ({
  SingleEntryPage: ({ modeSwitch }: { modeSwitch: ReactNode }) => (
    <div>
      {modeSwitch}
      <p>1件入力の画面</p>
    </div>
  ),
}));

import { InspectionFormPage } from '../InspectionFormPage';

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <InspectionFormPage />
    </MemoryRouter>,
  );

describe('点検登録フォーム（B3・B4）', () => {
  it('既定は一括入力。枠の中の切替で1件入力にする。管理会社には点検一覧を出す', () => {
    auth.isManagement = false;
    const { unmount } = renderAt('/');
    expect(screen.getByText('一括入力の画面')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '一括入力' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '1件入力' }));
    expect(screen.getByText('1件入力の画面')).toBeInTheDocument();
    unmount();

    auth.isManagement = true;
    renderAt('/');
    expect(screen.getByText('点検一覧の画面')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '1件入力' })).toBeNull();
  });

  it('3つ目の切替「報告書確認」は ?mode=reports で開き、知らない値は一括入力に落とす（修正依頼1027）', () => {
    auth.isManagement = false;
    const { unmount } = renderAt('/?mode=reports');
    expect(screen.getByText('報告書確認の画面')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '報告書確認' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '一括入力' }));
    expect(screen.getByText('一括入力の画面')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '報告書確認' }));
    expect(screen.getByText('報告書確認の画面')).toBeInTheDocument();
    unmount();

    renderAt('/?mode=unknown');
    expect(screen.getByText('一括入力の画面')).toBeInTheDocument();
  });
});
