import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { useBulkStore } from '@/stores/bulkStore';
import { BulkTable, type BulkRowInfo } from '../components/BulkTable';
import type { BulkScheduleMeta } from '../types';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {}, SUPABASE_URL: 'https://example.supabase.co' }));

/* 点検登録フォームの表の並びと表示（修正依頼1026 I3〜I6・I8・I9） */

const info = (): BulkRowInfo => ({ managementName: '長谷工', vendorName: '三菱電機', months: '4', inspectedOn: '-' });

function meta(key: string, extra: Partial<BulkScheduleMeta> = {}): BulkScheduleMeta {
  return { key, inspectionId: 'i1', targetMonth: '2026-11-01', locked: false, propertyName: 'ＹＡＤＯ／Ｒｅ薬院', terminalIds: ['r0001A01'], ...extra };
}

function renderTable() {
  return render(
    <ToastProvider>
      <BulkTable
        onOpenRowDetail={() => {}}
        confirm={async () => true}
        isVisible={() => true}
        propertyAllowed={() => true}
        infoOf={info}
        showManagement
        showVendor
      />
    </ToastProvider>,
  );
}

describe('点検登録フォームの表（修正依頼1026）', () => {
  beforeEach(() => {
    useBulkStore.setState({ rows: [], selectedIds: new Set() });
    useBulkStore.getState().syncScheduleRows([
      { meta: meta('i1:2026-11-01', { unitCode: 'No1' }), row: { propertyCode: 'r0001A01', inspectionType: 'エレベーター定期点検' } },
      { meta: meta('i2:2026-11-01'), row: { propertyCode: '120442-00', inspectionType: 'エレベーター定期点検' } },
    ]);
  });

  it('管理会社・保守会社の列は右側（メモの後、右端の詳細の手前）、報告書UP・完了連絡の見出しは2行', () => {
    renderTable();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(heads.slice(-4)).toEqual(['メモ', '管理会社', '保守会社', '詳細']);
    expect(screen.getByRole('columnheader', { name: /報告書UP・/ }).querySelector('br')).not.toBeNull();
  });

  it('物件の下は設備会社固有の No だけ（物件コードは出さない）。No の無い点検は物件コードを出す（I6）', () => {
    renderTable();
    const [withUnit, withoutUnit] = screen.getAllByRole('row').slice(1);
    expect(within(withUnit!).getByTestId('unit-code')).toHaveTextContent('No1');
    expect(within(withUnit!).queryByText('r0001A01')).toBeNull();
    expect(within(withoutUnit!).getByText('120442-00')).toBeInTheDocument();
  });

  it('備考は2行の入力欄で、目安を超えたら下に注意を出す（行はエラーにしない）。開始日・終了日・備考は必須の色（I8・I9）', () => {
    renderTable();
    const row = screen.getAllByRole('row')[1]!;
    const remarks = within(row).getByLabelText('備考');
    expect(remarks.tagName).toBe('TEXTAREA');
    expect(remarks).toHaveAttribute('rows', '2');
    expect(remarks).toHaveAttribute('placeholder', expect.stringContaining('001号機:9時30分～11時00分'));
    fireEvent.change(remarks, { target: { value: 'あ'.repeat(26) } });
    expect(within(row).getByTestId('remarks-warning')).toHaveTextContent('目安を超えています');
    expect(useBulkStore.getState().rows[0]!.isValid).toBe(true);
    for (const label of ['点検開始日', '点検終了日', '備考']) {
      expect(within(row).getByLabelText(label)).toHaveClass('field-required');
    }
  });
});
