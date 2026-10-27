import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAiOcrStatus: vi.fn(async () => ({ configured: true, message: null })),
  fetchCorrectionDictionary: vi.fn(async () => [] as unknown[]),
  recordCorrections: vi.fn(async (_records: unknown[]) => {}),
  readWithAiOcr: vi.fn(),
  bytesToBase64: vi.fn(() => 'AAAA'),
  registerPropertyFile: vi.fn(),
  fetchPropertyFileTargets: vi.fn(async () => [] as { code: string; name: string }[]),
}));
vi.mock('@/lib/api/property-files', () => api);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));
// jsdom には canvas の描画が無いので、pdfjs は差し替える（プレビューと文字情報の読み取り）
const pdfTexts = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({
    pageCount: 1,
    render: vi.fn(async () => {}),
    pageTexts: vi.fn(async () => pdfTexts.value),
    destroy: vi.fn(),
  })),
}));

import { OtherFileUploadModal } from '../components/OtherFileUploadModal';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  pdfTexts.value = [];
});

/** 建物名の「検索して選ぶ」欄で選ぶ（修正依頼1026 J1） */
async function chooseProperty(name: RegExp) {
  fireEvent.click(screen.getByLabelText('建物名'));
  fireEvent.click(await screen.findByRole('option', { name }));
}

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
    await chooseProperty(/テスト第二マンション/);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: {
        files: [
          new File(['%PDF-1.4'], '規約.pdf', { type: 'application/pdf' }),
          // OS によって Excel の type が空で来る（拡張子で MIME を決める）
          new File(['x'], '設備一覧.xlsx', { type: '' }),
        ],
      },
    });
    // 作業実施日が空なので今日の日付が入り（修正依頼1027(5)）、保存する名前は「作業実施日_建物名_区分」になる
    await waitFor(() => expect((screen.getByLabelText('作業実施日') as HTMLInputElement).value).not.toBe(''));
    fireEvent.click(screen.getByRole('button', { name: '2件を登録する' }));
    await waitFor(() => expect(api.registerPropertyFile).toHaveBeenCalledTimes(2));
    expect(api.registerPropertyFile.mock.calls[0]![0]).toMatchObject({
      propertyCode: '900002-00',
      category: 'other',
      categoryNote: '管理規約',
      fileName: expect.stringMatching(/^\d{8}_テスト第二マンション_その他（管理規約）_1\.pdf$/),
    });
    const second = api.registerPropertyFile.mock.calls[1]![0] as { file: File };
    expect(second.file.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.getAllByText('登録しました')).toHaveLength(2);
  });

  it('AI-OCR を使わずにファイルを追加して作業実施日が空なら、今日の日付を入れる（修正依頼1027(5)）', async () => {
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: { files: [new File(['x'], '見積.xlsx', { type: '' })] },
    });
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    await waitFor(() => expect((screen.getByLabelText('作業実施日') as HTMLInputElement).value).toBe(today));
  });

  it('建物の選択肢に、DB の置ける建物（点検行の無い自社物件）も出す', async () => {
    api.fetchPropertyFileTargets.mockResolvedValueOnce([{ code: '900003-00', name: 'テスト第三マンション（点検なし）' }]);
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    await waitFor(() => expect(api.fetchPropertyFileTargets).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('建物名'));
    expect(await screen.findByRole('option', { name: /テスト第三マンション（点検なし）/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /テスト第一マンション/ })).toBeInTheDocument();
  });

  it('置けない形式のファイルは追加しない', () => {
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: { files: [new File(['x'], 'a.exe', { type: 'application/octet-stream' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('PDF・画像（JPG/PNG）・Excel・Word・PowerPoint のファイルを選んでください');
    expect(screen.queryByTestId('other-file-1')).not.toBeInTheDocument();
  });

  it('AI-OCR で画像を読み、区分・建物・作業実施日の初期値を入れ、登録後に確定した値を記録する', async () => {
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
    // 画像はプレビューにそのまま出す（J3）
    expect(screen.getByTestId('file-preview').querySelector('img')).not.toBeNull();
    expect(api.readWithAiOcr).toHaveBeenCalledWith(expect.objectContaining({ mode: 'image', mediaType: 'image/jpeg' }));
    expect(screen.getByRole('radio', { name: '見積書' })).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByLabelText('建物名') as HTMLInputElement).value).toBe('テスト第一マンション');
    expect((screen.getByLabelText('作業実施日') as HTMLInputElement).value).toBe('2026-10-20');
    fireEvent.click(screen.getByRole('button', { name: '1件を登録する' }));
    await waitFor(() => expect(api.recordCorrections).toHaveBeenCalled());
    expect(api.recordCorrections.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'property', raw_text: 'テスト第一マンション', resolved_value: '900001-00' }),
        expect.objectContaining({ field: 'category', raw_text: '見積書', resolved_value: 'estimate' }),
      ]),
    );
    // 作業実施日があれば「作業実施日_建物名_区分」で保存する（J4）
    expect(api.registerPropertyFile.mock.calls[0]![0]).toMatchObject({ fileName: '20261020_テスト第一マンション_見積書.jpg' });
  });

  it('期間の書類（PDF の文字情報）は前半の日付を作業実施日の初期値にし、保存するファイル名にも使う（修正依頼1026 J4）', async () => {
    pdfTexts.value = ['請求書\n作業期間 2026年9月1日～2026年9月30日\nテスト第二マンション'];
    api.registerPropertyFile.mockResolvedValue({ id: 'f1' });
    render(<OtherFileUploadModal open onClose={vi.fn()} properties={properties} />);
    fireEvent.click(screen.getByRole('radio', { name: '請求書' }));
    await chooseProperty(/テスト第二マンション/);
    fireEvent.change(screen.getByTestId('other-file-input'), {
      target: {
        files: [
          new File(['%PDF-1.4'], 'scan001.pdf', { type: 'application/pdf' }),
          new File(['%PDF-1.4 b'], 'scan002.pdf', { type: 'application/pdf' }),
        ],
      },
    });
    await waitFor(() => expect((screen.getByLabelText('作業実施日') as HTMLInputElement).value).toBe('2026-09-01'));
    expect(screen.getByText('※リストにない建物は建物追加申請をお願いします。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2件を登録する' }));
    await waitFor(() => expect(api.registerPropertyFile).toHaveBeenCalledTimes(2));
    expect(api.registerPropertyFile.mock.calls.map((c) => (c[0] as { fileName: string }).fileName)).toEqual([
      '20260901_テスト第二マンション_請求書_1.pdf',
      '20260901_テスト第二マンション_請求書_2.pdf',
    ]);
  });
});
