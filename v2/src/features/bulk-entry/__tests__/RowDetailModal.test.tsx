import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { RowDetailModal, type RowDetailContext } from '../modals/RowDetailModal';
import { buildBulkEntries } from '../utils/buildBulkEntries';
import { todayUtc } from '@/lib/utils';
import { createMemoryStorage } from './memoryStorage';

const io = vi.hoisted(() => ({
  preparePosterImage: vi.fn(),
  uploadPosterImage: vi.fn(),
  discardOwnPosterImages: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {}, SUPABASE_URL: 'https://example.supabase.co' }));
vi.mock('@/lib/pdfToPng', () => ({ preparePosterImage: io.preparePosterImage }));
vi.mock('@/lib/storage', () => ({
  uploadPosterImage: io.uploadPosterImage,
  discardOwnPosterImages: io.discardOwnPosterImages,
}));
vi.mock('@/lib/templateStorage', () => ({ templateFileUrl: (f: string) => `https://storage/templates/${f}` }));

function setup() {
  const store = useBulkStore.getState();
  store.setUserId('user-1');
  store.setMasterData({
    properties: [{ propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' }],
    vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '092-000-0000' }],
    notices: [{ inspectionType: '消防設備点検', templateNo: 'fire_inspection', noticeText: '点検中です' }],
    templateImages: [{ image_key: 'Fire_Inspection', image_url: 'https://img/fire.png', display_name: '消防設備点検（テンプレ）' }],
  });
  store.setCurrentVendor({ id: 'v1', name: 'A社' });
  const id = store.addRow({
    propertyCode: 'z0001A01',
    inspectionType: '消防設備点検',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
  });
  render(
    <ToastProvider>
      <RowDetailModal open rowId={id} onClose={() => {}} />
    </ToastProvider>,
  );
  return id;
}

/** 閉じるとフォームが外れる（実際の画面と同じ）。片付けの確認用 */
function ClosingHarness({ rowId }: { rowId: number }) {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <RowDetailModal open={open} rowId={rowId} onClose={() => setOpen(false)} />
    </ToastProvider>
  );
}

const IMG = (n: string) => `https://example.supabase.co/storage/v1/object/public/poster-images/user-1/${n}.png`;

const rowOf = (id: number) => useBulkStore.getState().rows.find((r) => r.id === id)!;

describe('RowDetailModal（修正依頼1024 B18）', () => {
  beforeEach(() => {
    // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    io.preparePosterImage.mockReset();
    io.uploadPosterImage.mockReset();
    io.discardOwnPosterImages.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('案内文の説明・連絡先の既定（保守会社の緊急連絡先）・テンプレート名を出し、表示期間は畳んでおく', () => {
    const id = setup();
    expect(screen.getByText(/デフォルトで表示される案内文/)).toBeInTheDocument();
    expect(screen.getByLabelText('掲示板用案内文')).toHaveValue('点検中です');
    expect(screen.getByLabelText('連絡先')).toHaveValue('092-000-0000');
    expect(screen.getByTestId('template-name')).toHaveTextContent('消防設備点検（テンプレ）');
    expect(screen.getByRole('button', { name: /表示期間/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('表示開始日')).not.toBeInTheDocument();

    // 畳んだまま保存しても表示期間は行の値（空）のまま。連絡先が既定のままなら行には持たない
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({ displayStartDate: '', displayEndDate: '', emergencyContact: '', posterType: 'template' });
  });

  it('畳んだ表示期間の要約は申請で保存される値と同じ（表示開始日が空なら申請日＝今日）。タイトルは表で見える物件名を出す', () => {
    const id = setup();
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('詳細設定（物件A 消防設備点検）');
    expect(screen.getByText('申請日 〜 2026-11-03')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const s = useBulkStore.getState();
    const [entry] = buildBulkEntries([rowOf(id)], s.masterData, s.currentVendor, s.appSettings);
    expect(entry).toMatchObject({ display_start_date: todayUtc(), display_end_date: '2026-11-03' });
  });

  it('表示期間を開くと表示開始日は今日・表示終了日は点検終了日が入り（触らなければ既定のまま＝申請日）、書き換えた連絡先と画面図で選んだ位置を保存する（修正依頼1027(3)）', () => {
    const id = setup();
    fireEvent.click(screen.getByRole('button', { name: /表示期間/ }));
    expect(screen.getByLabelText('表示開始日')).toHaveValue(todayUtc());
    expect(screen.getByLabelText('表示終了日')).toHaveValue('2026-11-03');
    fireEvent.change(screen.getByLabelText('連絡先'), { target: { value: '03-1111-2222' } });
    // 表示時間・貼紙表示位置は畳んである（修正依頼1025 F7）
    fireEvent.click(screen.getByRole('button', { name: /表示時間・貼紙表示位置/ }));
    fireEvent.click(screen.getByRole('radio', { name: /④中央/ }));
    expect(screen.getByRole('radio', { name: /④中央/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({
      displayStartDate: '',
      displayEndDate: '',
      emergencyContact: '03-1111-2222',
      position: 4,
    });
  });

  it('追加の貼紙は選んだ時点でアップロードして URL を行に保存し、複数ページの PDF は1ページ目を使うと知らせる', async () => {
    const id = setup();
    const png = new File(['x'], 'poster.png', { type: 'image/png' });
    io.preparePosterImage.mockResolvedValue({ file: png, notice: 'PDF は3ページあります。1ページ目を使用します' });
    io.uploadPosterImage.mockResolvedValue('https://example.supabase.co/storage/v1/object/public/poster-images/user-1/1_ab.png');

    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    // 画像を選ぶ前は保存できない
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('追加の貼紙画像を選択してください')).toBeInTheDocument();
    expect(rowOf(id).posterType).toBe('template');

    const pdf = new File(['%PDF'], 'poster.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [pdf] } });
    await waitFor(() => expect(io.uploadPosterImage).toHaveBeenCalledWith(png, 'user-1'));
    expect(io.preparePosterImage).toHaveBeenCalledWith(pdf);
    expect(await screen.findByText(/1ページ目を使用します/)).toBeInTheDocument();
    expect(screen.getByAltText('追加の貼紙')).toHaveAttribute('src', 'https://example.supabase.co/storage/v1/object/public/poster-images/user-1/1_ab.png');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({
      posterType: 'custom',
      posterImage: 'https://example.supabase.co/storage/v1/object/public/poster-images/user-1/1_ab.png',
      isValid: true,
    });
  });

  it('キャンセルで閉じると、開いている間にアップロードした画像を片付ける（行の画像は変えない）', async () => {
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    const id = store.addRow({ propertyCode: 'z0001A01', posterType: 'custom', posterImage: IMG('old') });
    render(<ClosingHarness rowId={id} />);
    io.preparePosterImage.mockImplementation(async (f: File) => ({ file: f }));
    io.uploadPosterImage.mockResolvedValue(IMG('new'));

    fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('追加の貼紙')).toHaveAttribute('src', IMG('new')));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(io.discardOwnPosterImages).toHaveBeenCalledTimes(1);
    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('new')], 'user-1');
    expect(rowOf(id).posterImage).toBe(IMG('old'));
  });

  it('差し替えて保存すると、途中でアップロードした画像と前の画像を片付ける。複製した行がまだ持つ前の画像は残す', async () => {
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    const id = store.addRow({ propertyCode: 'z0001A01', posterType: 'custom', posterImage: IMG('old') });
    store.addRow({ propertyCode: 'z0001A01', posterType: 'custom', posterImage: IMG('old') });
    render(<ClosingHarness rowId={id} />);
    io.preparePosterImage.mockImplementation(async (f: File) => ({ file: f }));
    io.uploadPosterImage.mockResolvedValueOnce(IMG('mid')).mockResolvedValueOnce(IMG('final'));

    for (const want of ['mid', 'final']) {
      fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
      await waitFor(() => expect(screen.getByAltText('追加の貼紙')).toHaveAttribute('src', IMG(want)));
    }
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(rowOf(id).posterImage).toBe(IMG('final'));
    // old は2行目が持っているので候補から外れる
    expect(io.discardOwnPosterImages).toHaveBeenCalledTimes(1);
    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('mid')], 'user-1');
  });

  it('テンプレートに戻して保存すると、行が持っていた画像を片付ける', () => {
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    const id = store.addRow({ propertyCode: 'z0001A01', posterType: 'custom', posterImage: IMG('old') });
    render(<ClosingHarness rowId={id} />);

    fireEvent.click(screen.getByRole('radio', { name: 'テンプレート' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(rowOf(id)).toMatchObject({ posterType: 'template', posterImage: '' });
    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('old')], 'user-1');
  });

  it('表示時間・貼紙表示位置は既定なら畳み（▶で開く）、既定と違う値なら開いておく（修正依頼1025 F7）', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /表示時間・貼紙表示位置/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio', { name: /②上中/ })).not.toBeInTheDocument();
    expect(screen.getByText(/②上中（既定で自動設定）/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('radio', { name: /②上中/ })).toBeChecked();
    cleanup();

    const id = useBulkStore.getState().addRow({ propertyCode: 'z0001A01', position: 4 });
    render(
      <ToastProvider>
        <RowDetailModal open rowId={id} onClose={() => {}} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: /表示時間・貼紙表示位置/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: /④中央/ })).toBeChecked();
  });

  it('テンプレートの貼紙に2枚目以降の貼紙を足して保存すると行と申請に入り、キャンセルならアップロードした分を片付ける（修正依頼1025 D3）', async () => {
    const id = setup();
    io.preparePosterImage.mockImplementation(async (f: File) => ({ file: f }));
    io.uploadPosterImage.mockResolvedValueOnce(IMG('extra2'));
    fireEvent.change(screen.getByLabelText('追加の貼紙の画像'), { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('2枚目の貼紙')).toHaveAttribute('src', IMG('extra2')));
    fireEvent.change(screen.getByLabelText('2枚目の表示位置'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(rowOf(id)).toMatchObject({
      posterType: 'template',
      extraPosters: [{ image_url: IMG('extra2'), source: 'upload', position: '0' }],
    });
    const s = useBulkStore.getState();
    const [entry] = buildBulkEntries([rowOf(id)], s.masterData, s.currentVendor, s.appSettings);
    expect(entry).toMatchObject({ poster_type: 'template', extra_posters: [{ image_url: IMG('extra2'), position: '0' }] });
    cleanup();

    // もう一度開いて足し、キャンセルすると、その分だけ片付ける（保存済みの2枚目は残る）
    io.uploadPosterImage.mockResolvedValueOnce(IMG('extra3'));
    render(<ClosingHarness rowId={id} />);
    fireEvent.change(screen.getByLabelText('追加の貼紙の画像'), { target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('3枚目の貼紙')).toHaveAttribute('src', IMG('extra3')));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('extra3')], 'user-1');
    expect(rowOf(id).extraPosters).toHaveLength(1);
  });
});

describe('RowDetailModal の追記表示と点検種別の変更（修正依頼1029）', () => {
  const insp = (id: string, code: string, label: string) => ({
    inspection_id: id,
    property_code: code,
    inspection_type_label: label,
    vendor_id: 'v1',
    unit_vendor_ids: [],
  });
  // 物件A（z0001A01-00）で自社が担当するのはエレベーター定期点検とリモート点検。消防設備点検は別の物件
  const INSPECTIONS = [
    insp('i-ev', 'z0001A01-00', 'エレベーター定期点検'),
    insp('i-remote', 'z0001A01-00', 'リモート点検'),
    insp('i-fire', 'z0002A01', '消防設備点検'),
  ];
  const VENDOR = { id: 'v1', name: 'A社' };

  function master() {
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    store.setMasterData({
      properties: [{ propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' }],
      vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '092-000-0000' }],
      notices: [
        { inspectionType: '消防設備点検', templateNo: 'fire_inspection', noticeText: '火災報知器が鳴ります' },
        { inspectionType: 'エレベーター定期点検', templateNo: 'elevator_inspection', noticeText: 'エレベーターが止まります' },
        { inspectionType: 'リモート点検', templateNo: 'remote_check', noticeText: '遠隔で点検します' },
      ],
      templateImages: [
        { image_key: 'elevator_inspection', image_url: 'https://img/ev.png', display_name: 'エレベーター点検' },
        { image_key: 'remote_check', image_url: 'https://img/remote.png', display_name: 'リモート点検' },
      ],
    });
    store.setCurrentVendor(VENDOR);
  }

  const scheduleInput = (inspectionId: string, label: string, locked = false) => ({
    meta: {
      key: `${inspectionId}:2026-11-01`,
      inspectionId,
      targetMonth: '2026-11-01',
      locked,
      propertyName: '物件A',
      terminalIds: ['T-A1'],
    },
    row: { propertyCode: 'z0001A01', inspectionType: label, terminalId: 'T-A1' },
  });

  function renderModal(rowId: number, context: RowDetailContext) {
    render(
      <ToastProvider>
        <RowDetailModal open rowId={rowId} onClose={() => {}} context={context} />
      </ToastProvider>,
    );
  }

  const entryOf = (id: number) => {
    const s = useBulkStore.getState();
    return buildBulkEntries([rowOf(id)], s.masterData, VENDOR, s.appSettings)[0];
  };

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    master();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('右上にステータス、プレビューの見出しに点検種別、下に登録者・登録日時を出す', () => {
    useBulkStore.getState().syncScheduleRows([scheduleInput('i-ev', 'エレベーター定期点検')]);
    const id = useBulkStore.getState().rows[0]!.id;
    renderModal(id, {
      status: 'applying',
      registrant: { email: 'mitsubishi@EV', at: '2026/10/26 0:39:54' },
      inspections: INSPECTIONS,
    });
    expect(screen.getByTestId('entry-status')).toHaveTextContent('点検予定申請中');
    expect(screen.getByTestId('poster-title')).toHaveTextContent('エレベーター定期点検');
    expect(screen.getByTestId('registrant')).toHaveTextContent('mitsubishi@EV');
    expect(screen.getByTestId('registrant')).toHaveTextContent('2026/10/26 0:39:54');
  });

  it('点検種別はその物件で自社が担当する種別だけ選べ、変えるとテンプレートNo・見出し・既定の案内文が追従する（手入力の行はそのまま変わる）', () => {
    const id = useBulkStore.getState().addRow({ propertyCode: 'z0001A01', inspectionType: 'エレベーター定期点検' });
    renderModal(id, { inspections: INSPECTIONS });
    expect(screen.getByTestId('entry-status')).toHaveTextContent('未申請');
    const select = screen.getByLabelText('点検種別') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['エレベーター定期点検', 'リモート点検']);
    fireEvent.change(select, { target: { value: 'リモート点検' } });
    expect(screen.getByTestId('template-no')).toHaveTextContent('remote_check');
    expect(screen.getByTestId('poster-title')).toHaveTextContent('リモート点検');
    expect(screen.getByLabelText('掲示板用案内文')).toHaveValue('遠隔で点検します');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id).inspectionType).toBe('リモート点検');
    expect(entryOf(id)).toMatchObject({ inspection_type: 'リモート点検', template_no: 'remote_check' });
  });

  it('点検予定の行で変えると、同じ月のその種別の点検の行へ入力を移し、元の行は空に戻す（紐付ける点検が変わる）', () => {
    const store = useBulkStore.getState();
    store.syncScheduleRows([scheduleInput('i-ev', 'エレベーター定期点検'), scheduleInput('i-remote', 'リモート点検')]);
    const [ev, remote] = useBulkStore.getState().rows;
    store.changeStartDate(ev!.id, '2026-11-05');
    store.changeRemarks(ev!.id, '午前中');
    renderModal(ev!.id, { status: 'not_applied', inspections: INSPECTIONS });
    fireEvent.change(screen.getByLabelText('点検種別'), { target: { value: 'リモート点検' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(remote!.id)).toMatchObject({ startDate: '2026-11-05', remarks: '午前中', noticeText: '遠隔で点検します' });
    expect(rowOf(ev!.id)).toMatchObject({ startDate: '', remarks: '', inspectionType: 'エレベーター定期点検' });
    expect(entryOf(remote!.id)).toMatchObject({
      inspection_type: 'リモート点検',
      template_no: 'remote_check',
      property_inspection_id: 'i-remote',
      target_month: '2026-11-01',
    });
  });

  it('移し先の点検がこの月に申請済みなら移さずに知らせる', async () => {
    const store = useBulkStore.getState();
    store.syncScheduleRows([scheduleInput('i-ev', 'エレベーター定期点検'), scheduleInput('i-remote', 'リモート点検', true)]);
    const [ev] = useBulkStore.getState().rows;
    store.changeStartDate(ev!.id, '2026-11-05');
    renderModal(ev!.id, { inspections: INSPECTIONS });
    fireEvent.change(screen.getByLabelText('点検種別'), { target: { value: 'リモート点検' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/申請済みです。点検種別は変えられません/)).toBeInTheDocument();
    expect(rowOf(ev!.id).startDate).toBe('2026-11-05');
  });
});
