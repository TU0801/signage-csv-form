import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportRowActions } from '../components/ReportRowActions';
import { reportPermissions, type ReportViewer } from '../lib/documents';
import type { DbInspectionReport } from '@/types/portal';
import { makeReport } from './fixtures';

const admin: ReportViewer = { isAdmin: true, isManagement: false, vendorId: null };
const vendor: ReportViewer = { isAdmin: false, isManagement: false, vendorId: 'v1' };
const otherVendor: ReportViewer = { isAdmin: false, isManagement: false, vendorId: 'v9' };
const management: ReportViewer = { isAdmin: false, isManagement: true, vendorId: null };

function buttons(report: DbInspectionReport, viewer: ReportViewer): string[] {
  const { unmount } = render(
    <ReportRowActions
      permissions={reportPermissions(report, viewer)}
      archived={report.storage_backend !== 'supabase'}
      onAction={vi.fn()}
    />,
  );
  const names = screen.queryAllByRole('button').map((b) => b.textContent ?? '');
  unmount();
  return names;
}

describe('ReportRowActions（ロール別の出し分け）', () => {
  const submitted = makeReport();

  it('保守会社は自社の版を編集・再提出でき、削除（管理者だけ。修正依頼1027 決定②）・受領・差戻しは出ない', () => {
    expect(buttons(submitted, vendor)).toEqual(['開く', 'DL', '再提出', '編集']);
    expect(buttons(submitted, otherVendor)).toEqual(['開く', 'DL']);
  });

  it('保守会社は受領済みの版を編集・削除できない（再提出だけ）', () => {
    expect(buttons(makeReport({ status: 'accepted' }), vendor)).toEqual(['開く', 'DL', '再提出']);
  });

  it('管理会社は受領・差戻しだけ、管理者はすべて', () => {
    expect(buttons(submitted, management)).toEqual(['開く', 'DL', '受領', '差戻し']);
    expect(buttons(submitted, admin)).toEqual(['開く', 'DL', '受領', '差戻し', '再提出', '編集', '削除']);
  });

  it('削除済みの復元は管理者だけ、保管庫へ移した版は開く・DL を出さない', () => {
    expect(buttons(makeReport({ status: 'deleted' }), admin)).toEqual(['開く', 'DL', '復元']);
    expect(buttons(makeReport({ status: 'deleted' }), vendor)).toEqual(['開く', 'DL']);
    render(
      <ReportRowActions
        permissions={reportPermissions(makeReport({ storage_backend: 'archive' }), management)}
        archived
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText('保管庫へ移動済み')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '開く' })).toBeNull();
  });
});
