import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeEntry } from './fixtures';

const csv = vi.hoisted(() => ({
  generateAdminCsv: vi.fn(() => 'csv'),
  downloadCsv: vi.fn(),
  copyCsvToClipboard: vi.fn(),
}));
vi.mock('@/lib/csv', async (orig) => ({ ...(await orig<typeof import('@/lib/csv')>()), ...csv }));
const zip = vi.hoisted(() => ({ downloadCustomImages: vi.fn(async () => 1) }));
vi.mock('@/lib/zipDownload', () => zip);
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
// jsdom には <dialog> の showModal/close が無いので、確認ダイアログは描画しない
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

import { EntryActions } from '../components/EntryActions';

const loaded = [
  makeEntry({ id: 'a', poster_type: 'custom', poster_image: 'https://example.test/a.jpg' }),
  makeEntry({ id: 'b', inspection_start: '2026-11-05' }),
];

beforeEach(() => vi.clearAllMocks());

describe('EntryActions (v1 admin-export.js exportCSV / downloadCustomImages)', () => {
  it('CSV and image ZIP use the loaded approved list, not the checked rows', async () => {
    render(
      <EntryActions
        entries={loaded}
        selectedEntries={loaded.slice(1)}
        filters={{ propertyCode: '', startDate: '', endDate: '', vendorName: '' }}
        propertyNames={new Map()}
        displayTimeDefault={undefined}
        onStatusChange={vi.fn()}
        onBulkDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(csv.generateAdminCsv).toHaveBeenCalledWith(loaded, undefined);

    fireEvent.click(screen.getByRole('button', { name: '追加登録された画像ダウンロード' }));
    await waitFor(() => expect(zip.downloadCustomImages).toHaveBeenCalledWith(loaded));
  });
});
