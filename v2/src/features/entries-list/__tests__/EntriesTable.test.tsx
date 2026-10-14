import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeEntry } from './fixtures';

const refetch = vi.hoisted(() => vi.fn(async () => {}));
const api = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  entryErrorReason: vi.fn(() => '理由'),
  updateEntriesStatusBulk: vi.fn(),
}));
vi.mock('@/lib/api/admin-entries', () => api);
vi.mock('../hooks/useEntriesTable', () => ({
  useEntriesTable: () => ({ entries: [makeEntry({ id: 'a' })], loading: false, error: null, refetch }),
}));
vi.mock('../hooks/useEntryLookups', () => ({
  useEntryLookups: () => ({
    properties: [],
    vendors: [],
    propertyNames: new Map(),
    emailOf: () => '-',
    displayTimeDefault: undefined,
    displayDefault: undefined,
  }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
// jsdom には <dialog> の showModal/close が無いので、確認ダイアログは描画しない
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
// 一括削除の呼び出しだけを見たいので、操作バーは onBulkDelete を直接呼ぶボタンに置き換える
vi.mock('../components/EntryActions', () => ({
  EntryActions: ({ onBulkDelete }: { onBulkDelete: (ids: string[]) => Promise<void> }) => (
    <button type="button" onClick={() => void onBulkDelete(['a', 'b'])}>
      一括削除
    </button>
  ),
}));
vi.mock('@/features/approval/components/EntryDetailModal', () => ({ EntryDetailModal: () => null }));
vi.mock('../components/EntryEditModal', () => ({ EntryEditModal: () => null }));

import { EntriesTable } from '../components/EntriesTable';

describe('EntriesTable bulk delete (v1 admin-entries.js bulkDeleteEntries)', () => {
  it('reloads the list even when a delete fails', async () => {
    api.deleteEntry.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    render(<EntriesTable />);
    fireEvent.click(screen.getByRole('button', { name: '一括削除' }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(api.deleteEntry).toHaveBeenCalledTimes(2);
  });
});
