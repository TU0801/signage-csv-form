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

// 1025 E1・E2 の確認用の物件（管理会社あり・なし、設備2件で同じ保守会社）
const row = (inspection_type_id: string, vendor_id: string | null) => ({
  inspection_type_id,
  vendor_id,
  inspection_months: [],
  remarks: '',
  remarks2: '',
});
const propertyB: PropertyWithUnits = {
  id: 'p2',
  property_code: 'B0002',
  property_name: '物件B',
  terminals: [],
  inspections: [row('fire', 'v1'), row('pump', 'v1')],
  units: [],
};
const propertyC: PropertyWithUnits = {
  id: 'p3',
  property_code: 'C0003',
  property_name: '物件C',
  terminals: [],
  inspections: [row('fire', null)],
  units: [],
};
const data = {
  properties: [property],
  managementCompanies: null as Map<string, { id: string; label: string; name: string }> | null,
};

vi.mock('../hooks/usePropertyMasterData', () => ({
  usePropertyMasterData: () => ({
    properties: data.properties,
    vendors: [{ id: 'v1', vendor_name: '三菱電機' }],
    inspectionTypes: [
      { id: 'fire', inspection_name: '消防設備点検' },
      { id: 'pump', inspection_name: '給水ポンプ点検' },
    ],
    unitTypeOptions: [],
    managementCompanies: data.managementCompanies,
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
    data.properties = [property];
    data.managementCompanies = null;
  });

  // E1: 絞り込みは管理会社（保守会社ではない）。列は略称、無ければ正式名。未設定の物件は「管理会社なし」で出せる
  it('filters by management company and shows its short name', () => {
    data.properties = [property, propertyB, propertyC];
    data.managementCompanies = new Map([
      ['z0023A01', { id: 'm1', label: '㈱えん建物管理', name: '株式会社えん建物管理' }],
      ['B0002', { id: 'm2', label: '株式会社長谷工コミュニティ九州', name: '株式会社長谷工コミュニティ九州' }],
    ]);
    render(<PropertiesMaster />);
    expect(screen.queryByRole('combobox', { name: '保守会社で絞り込み' })).toBeNull();
    expect(screen.getByText('㈱えん建物管理')).toBeTruthy();
    const select = screen.getByRole('combobox', { name: '管理会社で絞り込み' });
    const pick = (text: string) => {
      fireEvent.focus(select);
      fireEvent.change(select, { target: { value: text } });
      fireEvent.keyDown(select, { key: 'Enter' });
    };
    pick('長谷工');
    expect(screen.getByText('物件B')).toBeTruthy();
    expect(screen.queryByText('物件A')).toBeNull();
    expect(screen.queryByText('物件C')).toBeNull();
    pick('管理会社なし');
    expect(screen.getByText('物件C')).toBeTruthy();
    expect(screen.queryByText('物件A')).toBeNull();
    expect(screen.queryByText('物件B')).toBeNull();
  });

  // E2: 保守会社は設備の行ごと（同じ会社でも2行）。既定は1行目だけで「2件 ▼」で開く。保守会社の無い設備は「未設定」
  it('lists one vendor per equipment row, collapsed to the first until n件 ▼ is opened', () => {
    data.properties = [propertyB, propertyC];
    render(<PropertiesMaster />);
    const [cellB, cellC] = screen.getAllByTestId('equipment-vendors');
    expect(cellB!.children).toHaveLength(1);
    expect(cellB!.textContent).toBe('三菱電機');
    expect(cellC!.textContent).toBe('未設定');
    const toggle = screen.getByRole('button', { name: /B0002 の設備 2件/ });
    expect(toggle.textContent).toBe('2件▼');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect([...cellB!.children].map((c) => c.textContent)).toEqual(['三菱電機消防設備点検', '三菱電機給水ポンプ点検']);
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


  // 修正依頼1027(7): 『物件コード』→『マンションコード』、『マンションコード（補助）』（業務システムの en_no）を一覧と編集に出す
  it('shows マンションコード and its 補助 in the list and the edit form', () => {
    data.properties = [{ ...property, en_no: '0023' }];
    render(<PropertiesMaster />);
    expect(screen.getByRole('columnheader', { name: 'マンションコード' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'マンションコード（補助）' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '物件コード' })).toBeNull();
    expect(screen.getByText('0023')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    const sub = screen.getByLabelText('マンションコード（補助）') as HTMLInputElement;
    expect(sub.value).toBe('0023');
    expect(sub.readOnly).toBe(true);
  });

  it('opens 編集 with read-only code, name and terminals', () => {
    render(<PropertiesMaster />);
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    const code = screen.getByLabelText('マンションコード') as HTMLInputElement;
    const name = screen.getByLabelText('物件名') as HTMLInputElement;
    expect(code.value).toBe('z0023A01');
    expect(code.readOnly).toBe(true);
    expect(name.value).toBe('物件A');
    expect(name.readOnly).toBe(true);
    expect(screen.getByLabelText('端末リスト').textContent).toContain('T1');
    expect(screen.queryByRole('button', { name: '+ 端末を追加' })).toBeNull();
  });
});
