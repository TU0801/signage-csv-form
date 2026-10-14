import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminSidebar } from '../AdminSidebar';

const countApprovedEntries = vi.fn(async (_filters: unknown) => 5);
vi.mock('@/lib/api/admin-entries', () => ({
  countPendingEntries: async () => 2,
  countApprovedEntries: (filters: unknown) => countApprovedEntries(filters),
}));
vi.mock('@/lib/api/relationships', () => ({
  countPendingBuildingRequests: async () => 1,
}));

describe('AdminSidebar (v1 admin.html .sidebar-nav / admin.js updateSidebarCounts)', () => {
  it('follows the v1 order and labels, counts draft entries plus building requests as 承認待ち', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminSidebar />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual([
      '承認待ち',
      '承認済み',
      '紐付け管理',
      'マスター管理',
      'ユーザー管理',
      '広告枠管理',
    ]);
    await waitFor(() => expect(within(links[0]!).getByText('3')).toBeInTheDocument());
    expect(within(links[1]!).getByText('5')).toBeInTheDocument();
    // 承認済みはデータ一覧と同じ条件（初回は開始日=今日）で数える
    expect(countApprovedEntries).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });
});
