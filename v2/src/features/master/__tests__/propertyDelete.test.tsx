import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PropertyFormModal } from '../components/property/PropertyFormModal';
import type { PropertyWithUnits } from '../hooks/usePropertyMasterData';

const addToast = vi.fn();
const fetchPropertyLinks = vi.fn();
const deleteMasterProperty = vi.fn();
const auth = { role: 'admin' as string };

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { profile: { id: string; role: string } }) => unknown) =>
    sel({ profile: { id: 'a1', role: auth.role } }),
}));
// jsdom の <dialog> には showModal() が無いので、Modal は開いているときだけ中身をそのまま描く
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
      </div>
    ) : null,
}));
vi.mock('@/lib/api/propertyMaster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/propertyMaster')>()),
  fetchPropertyLinks: (...a: unknown[]) => fetchPropertyLinks(...a),
  deleteMasterProperty: (...a: unknown[]) => deleteMasterProperty(...a),
}));

const property: PropertyWithUnits = {
  id: 'p1',
  property_code: 'z0090A02',
  property_name: 'エンクレスト博多STYLE',
  terminals: [],
  inspections: [],
  units: [],
  en_no: null,
};
const noLinks = { entries: 0, reports: 0, building_vendors: 0, files: 0, building_equipment: 0, inspections: 0, units: 0 };

const renderModal = (onClose = vi.fn(), onSaved = vi.fn()) =>
  render(
    <PropertyFormModal
      property={property}
      vendors={[]}
      inspectionTypes={[]}
      unitTypeOptions={[]}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

// 修正依頼1027(7): 物件を編集の『削除』。紐付けがあれば消さずに理由を出し、無ければ確認してから消す（管理者だけ）
describe('PropertyFormModal 削除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = 'admin';
  });

  it('refuses with 「紐づけありの為、削除できません」 and the counts when the property has links', async () => {
    fetchPropertyLinks.mockResolvedValue({ ...noLinks, building_vendors: 1 });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('紐づけありの為、削除できません（保守会社の紐付け 1件）');
    expect(fetchPropertyLinks).toHaveBeenCalledWith('z0090A02');
    expect(deleteMasterProperty).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '物件の削除' })).toBeNull();
  });

  it('deletes after confirmation when there are no links, then closes and reloads', async () => {
    fetchPropertyLinks.mockResolvedValue(noLinks);
    deleteMasterProperty.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal(onClose, onSaved);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    const confirm = await screen.findByRole('dialog', { name: '物件の削除' });
    expect(confirm).toHaveTextContent('業務システムの物件は残り');
    const buttons = screen.getAllByRole('button', { name: '削除' });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(deleteMasterProperty).toHaveBeenCalledWith('z0090A02'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no 削除 to a management account', () => {
    auth.role = 'management';
    renderModal();
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
  });
});
