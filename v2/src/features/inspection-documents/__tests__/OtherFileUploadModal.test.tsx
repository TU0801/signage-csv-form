import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAiOcrStatus: vi.fn(async () => ({ configured: true, message: null })),
  fetchCorrectionDictionary: vi.fn(async () => [] as unknown[]),
  recordCorrections: vi.fn(async (_records: unknown[]) => {}),
  readWithAiOcr: vi.fn(),
  bytesToBase64: vi.fn(() => 'AAAA'),
  registerPropertyFile: vi.fn(),
}));
vi.mock('@/lib/api/property-files', () => api);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));

import { OtherFileUploadModal } from '../components/OtherFileUploadModal';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
beforeEach(() => vi.clearAllMocks());

const properties = [
  { code: '900001-00', name: 'テスト第一マンション' },
  { code: '900002-00', name: 'テスト第二マンション' },
];

describe('OtherFileUploadModal', () => {
  it('区分・建物・ファイルを確かめてから、ファイルごとに登録する（その他は内容が要る）', async () => {
    api.registerPropertyFile.mockResolvedValue({ id: 'f1' });
    const onUploaded = vi.fn();
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByText('区分を選んでください')).toBeInTheDocument();
    expect(screen.getByText('建物を選んでください', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('ファイルを追加してください')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'その他' }));
    expect(screen.getByText('「その他」の内容を入力してください')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('その他の内容'), { target: { value: '管理規約' } });
    fireEvent.change(screen.getByLabelText('建物名'), { target: { value: '900002-00' } });
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: {
        files: [
          new File(['%PDF-1.4'], '規約.pdf', { type: 'application/pdf' }),
          // OS によって Excel の type が空で来る（拡張子で MIME を決める）
          new File(['x'], '設備一覧.xlsx', { type: '' }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '2件を登録する' }));
    await waitFor(() => expect(api.registerPropertyFile).toHaveBeenCalledTimes(2));
    expect(api.registerPropertyFile.mock.calls[0]![0]).toMatchObject({
      propertyCode: '900002-00',
      category: 'other',
      categoryNote: '管理規約',
      fileName: '規約.pdf',
    });
    const second = api.registerPropertyFile.mock.calls[1]![0] as { file: File };
    expect(second.file.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.getAllByText('登録しました')).toHaveLength(2);
  });

  it('置けない形式のファイルは追加しない', () => {
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: { files: [new File(['x'], 'a.exe', { type: 'application/octet-stream' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('PDF・画像（JPG/PNG）・Excel・Word・PowerPoint のファイルを選んでください');
    expect(screen.queryByTestId('other-file-1')).not.toBeInTheDocument();
  });

  it('AI-OCR で画像を読み、区分・建物・書類の日付の初期値を入れ、登録後に確定した値を記録する', async () => {
    api.readWithAiOcr.mockResolvedValue({
      document_type: '見積書',
      target_month_text: '',
      target_month: '',
      performed_on_text: '令和8年10月20日',
      performed_on: '',
      vendor_name: '',
      inspection_type: '',
      pages: [{ page: 1, building_name: 'テスト第一マンション 御中', inspection_type: '', performed_on: '' }],
    });
    api.registerPropertyFile.mockResolvedValue({ id: 'f1' });
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    const box = await screen.findByRole('checkbox', { name: 'AI-OCRで判定' });
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: { files: [new File(['img'], '見積.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByTestId('ocr-summary')).toHaveTextContent('見積書');
    expect(api.readWithAiOcr).toHaveBeenCalledWith(expect.objectContaining({ mode: 'image', mediaType: 'image/jpeg' }));
    expect(screen.getByRole('radio', { name: '見積書' })).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByLabelText('建物名') as HTMLSelectElement).value).toBe('900001-00');
    expect((screen.getByLabelText('書類の日付') as HTMLInputElement).value).toBe('2026-10-20');
    fireEvent.click(screen.getByRole('button', { name: '1件を登録する' }));
    await waitFor(() => expect(api.recordCorrections).toHaveBeenCalled());
    expect(api.recordCorrections.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'property', raw_text: 'テスト第一マンション', resolved_value: '900001-00' }),
        expect.objectContaining({ field: 'category', raw_text: '見積書', resolved_value: 'estimate' }),
      ]),
    );
  });
});
