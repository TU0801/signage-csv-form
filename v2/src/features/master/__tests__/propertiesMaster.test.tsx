import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertiesMaster } from '../instances/PropertiesMaster';
import type { PropertyWithUnits } from '../hooks/usePropertyMasterData';

const addToast = vi.fn();
const fromCalls: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`unexpected write to ${table}`);
    },
  },
  TABLES: {},
  RPC: {},
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
// jsdom の <dialog> には showModal() が無いので、Modal は中身をそのまま描く
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  ),
}));

const property: PropertyWithUnits = {
  id: 'p1',
  property_code: 'z0023A01',
  property_name: '物件A',
  terminals: [{ terminal_id: 'T1', supplement: '1F' }],
  inspections: [],
  units: [],
};

vi.mock('../hooks/usePropertyMasterData', () => ({
  usePropertyMasterData: () => ({
    properties: [property],
    vendors: [],
    inspectionTypes: [],
    unitTypeOptions: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// 物件の正本は業務システム（2026-10-15）。追加は業務システムへのリンクだけで、行の削除は出さない。コード・名前・端末は読み取り専用
describe('PropertiesMaster', () => {
  beforeEach(() => {
    addToast.mockClear();
    fromCalls.length = 0;
  });

  it('links 追加 to the business system and has no 削除 button (no DB call)', () => {
    render(<PropertiesMaster />);
    const link = screen.getByRole('link', { name: '業務システムで追加' });
    expect(link.getAttribute('href')).toBe('https://system.1984.jp/properties');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ 新規追加' })).toBeNull();
    expect(fromCalls).toEqual([]);
  });


  it('opens 編集 with read-only code, name and terminals', () => {
    render(<PropertiesMaster />);
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    const code = screen.getByLabelText('物件コード') as HTMLInputElement;
    const name = screen.getByLabelText('物件名') as HTMLInputElement;
    expect(code.value).toBe('z0023A01');
    expect(code.readOnly).toBe(true);
    expect(name.value).toBe('物件A');
    expect(name.readOnly).toBe(true);
    expect(screen.getByLabelText('端末リスト').textContent).toContain('T1');
    expect(screen.queryByRole('button', { name: '+ 端末を追加' })).toBeNull();
  });
});
