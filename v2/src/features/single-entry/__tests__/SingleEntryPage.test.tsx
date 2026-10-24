import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { HeaderSlotContext } from '@/components/layout/HeaderSlot';
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { useSingleEntryStore } from '@/features/single-entry/stores/singleEntryStore';
import { useInspectionFormStore } from '@/stores/inspectionFormStore';
import { PROPERTIES, SETTINGS, TYPES } from './fixtures';
import type { DbVendor } from '@/types/database';

const VENDORS: DbVendor[] = [
  // 名前順の先頭（v1 は一般ユーザーでもこの会社になっていた。v2 は自社を記録する。ユーザー決定 2026-10-25）
  { id: 'v-first', vendor_name: '㈱IHIﾊﾟｰｷﾝｸﾞｽｸｴｱ', emergency_contact: '03-0000-0000', inspection_type: null, created_at: null },
  { id: 'v-mine', vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱', emergency_contact: '0120-000-000', inspection_type: null, created_at: null },
];

const insertEntries = vi.fn();
let isAdmin = false;

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
const storageApi = vi.hoisted(() => ({ uploadPosterImage: vi.fn(), discardOwnPosterImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  getPublicUrl: (p: string) => `https://storage/${p}`,
  uploadPosterImage: storageApi.uploadPosterImage,
  discardOwnPosterImages: storageApi.discardOwnPosterImages,
  validateImageFile: vi.fn(),
}));
// PDF の変換（pdfjs-dist）は jsdom で動かないので差し替える（B18）
const pdfToPng = vi.hoisted(() => ({ preparePosterImage: vi.fn() }));
vi.mock('@/lib/pdfToPng', () => pdfToPng);
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', role: isAdmin ? 'admin' : 'user', vendor_id: isAdmin ? null : 'v-mine' },
    isAdmin,
  }),
}));
// 管理会社フィルターの候補（範囲つき RPC management_companies_scoped。修正依頼1024 B2）
vi.mock('@/lib/api/inspection-form', () => ({
  fetchScopedManagementCompanies: () =>
    Promise.resolve([
      { property_code: '120273-00', management_company_id: 'c-en', management_company_name: '株式会社えん建物管理' },
      { property_code: '2010', management_company_id: null, management_company_name: null },
    ]),
}));
vi.mock('@/hooks/useMasterData', () => ({
  useMasterData: () => ({
    properties: PROPERTIES,
    vendors: VENDORS,
    inspectionTypes: TYPES,
    categories: [],
    templateImages: [],
    loading: false,
    error: null,
  }),
}));
// 管理者が選んだ保守会社の担当物件（ここでは全物件）
vi.mock('@/lib/api/relationships', () => ({
  fetchActivePropertyCodes: () => Promise.resolve(['120273-00', 'z0015A01', '2010']),
}));
// 申請を結び付ける点検行（portal_inspections。保守会社のアカウントは DB が担当の点検に絞って返す）。点検月の無い点検行はどの月の申請も結び付く
const portalApi = vi.hoisted(() => ({ fail: false, extra: [] as Record<string, unknown>[] }));
vi.mock('@/lib/api/portal', async () => {
  const { makeInspection } = await import('@/features/inspection-portal/__tests__/fixtures');
  return {
    fetchPortalInspections: () =>
      portalApi.fail
        ? Promise.reject(new Error('portal failed'))
        : Promise.resolve([
            makeInspection({ inspection_id: 'i-clean', property_code: 'z0015A01', inspection_type_label: '排水管清掃', vendor_id: 'v-mine', inspection_months: [] }),
            ...portalApi.extra.map((over) => makeInspection(over)),
          ]),
  };
});
vi.mock('@/lib/api/single-entry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/single-entry')>();
  return {
    ...actual,
    fetchAppSettings: () => Promise.resolve(SETTINGS),
    fetchLinkedInspectionIds: () => Promise.resolve(new Set(['clean'])),
    fetchMyEntriesThisMonth: () => Promise.resolve([]),
    insertEntries: (...args: unknown[]) => insertEntries(...args),
  };
});

/** 検索つきの選択欄で、コードで絞って先頭の候補を選ぶ */
function pick(name: string, query: string) {
  const input = screen.getByRole('combobox', { name });
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: query } });
  // 管理者の保守会社・管理会社はネイティブ select なので、開いた一覧の中から選ぶ
  fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
}

beforeEach(() => {
  // 作成データは store に残るので、テストごとに空にする
  useSingleEntryStore.setState({ userId: null, entries: [] });
  useInspectionFormStore.setState({ managementCompanyId: '' });
  // jsdom には <dialog> の showModal / close が無い（ConfirmDialog が使う）
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  isAdmin = false;
  portalApi.fail = false;
  portalApi.extra = [];
  insertEntries.mockReset();
  insertEntries.mockResolvedValue([]);
});

describe('1件入力画面（一般ユーザー）', () => {
  // 記録する保守会社は自社（ユーザー決定 2026-10-25）。v1 は社名順の先頭（index.html:363 の #vendor = 0）で、ここは v1 と意図して違う
  it('自社の紐付けを反映し、点検行に結び付けて点検の保守会社（自社）で未設置物件の案内を申請できる', async () => {
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );

    // 紐付けが1カテゴリ（清掃）だけなので、カテゴリと先頭の紐付け点検種別が選ばれる（v1 applyLinkedDefaults）
    await waitFor(() => expect(screen.getByLabelText('案内カテゴリ')).toHaveValue('清掃'));
    expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃');
    // 保守会社の選択は管理者だけ（このテストはヘッダーを描かないので、ヘッダーの部品は出ない）
    expect(screen.queryByRole('combobox', { name: '保守会社' })).toBeNull();

    pick('物件コード *', 'z0015A01');
    // 端末の無い物件は選ぶ欄の代わりに未設置と出す（入力・申請はできる）
    expect(screen.getByText('サイネージ未設置（端末なし）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('z0015A01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    await waitFor(() => expect(insertEntries).toHaveBeenCalledTimes(1));
    const rows = insertEntries.mock.calls[0]![0] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'u1',
      property_code: 'z0015A01',
      terminal_id: '',
      vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱',
      emergency_contact: '0120-000-000',
      inspection_type: '排水管清掃',
      display_duration: 10,
      status: 'draft',
      // 点検行に一致したので結び付ける。保守会社は自社（DB が自社以外を拒む）
      property_inspection_id: 'i-clean',
      vendor_id: 'v-mine',
      target_month: `${String(rows[0]!.inspection_start).slice(0, 7)}-01`,
    });
  });
});

describe('1件入力画面（管理者の管理会社フィルター）', () => {
  it('既定は全て。管理会社で物件の選択肢を絞り、外れた物件の選択を外す。未設定には業務システムに無い物件も入る', async () => {
    isAdmin = true;
    render(
      <HeaderSlotContext.Provider value={{ target: document.body, setTarget: () => {} }}>
        <ToastProvider>
          <SingleEntryPage />
        </ToastProvider>
      </HeaderSlotContext.Provider>,
    );

    const filter = await screen.findByLabelText('管理会社');
    expect(filter).toHaveValue('');
    const propertyInput = screen.getByRole('combobox', { name: '物件コード *' });
    // 候補は一覧を開いている間だけ出る。開いてコードを読み、閉じる
    const codes = () => {
      fireEvent.click(propertyInput);
      const list = within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent?.split(' ')[0]);
      fireEvent.keyDown(propertyInput, { key: 'Escape' });
      return list;
    };
    expect(codes()).toEqual(['2010', '120273-00', 'z0015A01']);

    fireEvent.change(filter, { target: { value: 'c-en' } });
    expect(codes()).toEqual(['120273-00']);

    // 選択は state で確かめる（選択肢に無い値は DOM 上は空に見えるため、端末ID の選択肢で見る）
    pick('物件コード *', '120273-00');
    const terminalSelect = () => screen.getByLabelText('端末ID', { exact: false, selector: 'select' });
    expect(terminalSelect()).toHaveValue('h0001A00');
    fireEvent.change(filter, { target: { value: '__none__' } });
    expect(codes()).toEqual(['2010', 'z0015A01']);
    expect(terminalSelect()).not.toHaveValue('h0001A00');
  });

  it('絞り込みの外の物件の行を編集で読み込むと、管理会社を全てに戻す', async () => {
    isAdmin = true;
    render(
      <HeaderSlotContext.Provider value={{ target: document.body, setTarget: () => {} }}>
        <ToastProvider>
          <SingleEntryPage />
        </ToastProvider>
      </HeaderSlotContext.Provider>,
    );

    const filter = await screen.findByLabelText('管理会社');
    // 管理者は保守会社を選ばないと追加できない（記録する保守会社が無い。ユーザー決定 2026-10-25）
    pick('保守会社', '三菱');
    await waitFor(() => {
      fireEvent.click(screen.getByRole('combobox', { name: '物件コード *' }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
    pick('物件コード *', '120273-00');
    pick('点検工事案内 *', '排水管');
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    const table = await screen.findByRole('table');

    fireEvent.change(filter, { target: { value: '__none__' } });
    fireEvent.click(within(table).getByRole('button', { name: '編集' }));
    expect(filter).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '物件コード *' })).toHaveValue('120273-00 端末あり');
    // 編集中は主ボタンが「更新」になり、行に印が付く
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
    expect(within(table).getByText('編集中')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '編集をやめる' }));
    expect(screen.getByRole('button', { name: 'データを追加' })).toBeInTheDocument();
  });
});

describe('1件入力画面（作成データの保持）', () => {
  it('申請前の作成データは画面を離れて戻っても残る', async () => {
    const view = () =>
      render(
        <ToastProvider>
          <SingleEntryPage />
        </ToastProvider>,
      );
    const first = view();
    await waitFor(() => expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃'));
    pick('物件コード *', 'z0015A01');
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    await screen.findByRole('table');
    first.unmount();

    view();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('z0015A01')).toBeInTheDocument();
    expect(useSingleEntryStore.getState().entries).toHaveLength(1);
  });
});

describe('1件入力画面（追加の貼紙・PDF。修正依頼1024 B18）', () => {
  it('PDF を選ぶと PNG に変換したものを貼紙画像にし、複数ページなら1ページ目を使うと知らせる', async () => {
    const png = new File(['png'], '貼紙.png', { type: 'image/png' });
    pdfToPng.preparePosterImage.mockResolvedValue({ file: png, notice: 'PDF は2ページあります。1ページ目を使用します' });
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃'));
    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    const input = screen.getByLabelText('貼紙画像');
    expect(input).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    const pdf = new File(['%PDF'], '貼紙.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    await waitFor(() => expect(pdfToPng.preparePosterImage).toHaveBeenCalledWith(pdf));
    expect(await screen.findByText(/1ページ目を使用します/)).toBeInTheDocument();
    expect(await screen.findByAltText('プレビュー')).toBeInTheDocument();
  });
});

describe('1件入力画面（使われない貼紙画像の片付け。修正依頼1024 後続 orphan）', () => {
  it('画像をアップロードしたあと申請の登録に失敗したら、その画像を片付ける', async () => {
    const png = new File(['png'], '貼紙.png', { type: 'image/png' });
    pdfToPng.preparePosterImage.mockResolvedValue({ file: png });
    storageApi.uploadPosterImage.mockReset().mockResolvedValue('https://storage/poster-images/u1/1_ab.png');
    storageApi.discardOwnPosterImages.mockReset();
    insertEntries.mockRejectedValue(new Error('insert failed'));
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃'));
    pick('物件コード *', 'z0015A01');
    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [png] } });
    expect(await screen.findByAltText('プレビュー')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    await waitFor(() =>
      expect(storageApi.discardOwnPosterImages).toHaveBeenCalledWith(['https://storage/poster-images/u1/1_ab.png'], 'u1'),
    );
    expect(storageApi.uploadPosterImage).toHaveBeenCalledWith(png, 'u1');
  });
});

describe('1件入力画面（点検予定への結び付け。修正依頼1024 後続）', () => {
  /** 追加の貼紙で z0015A01 の作成データを1件作り、申請する */
  async function submitCustomEntry() {
    const png = new File(['png'], '貼紙.png', { type: 'image/png' });
    pdfToPng.preparePosterImage.mockResolvedValue({ file: png });
    storageApi.uploadPosterImage.mockReset().mockResolvedValue('https://storage/poster-images/u1/1_ab.png');
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃'));
    pick('物件コード *', 'z0015A01');
    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [png] } });
    expect(await screen.findByAltText('プレビュー')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    await waitFor(() => expect(insertEntries).toHaveBeenCalledTimes(1));
    return (insertEntries.mock.calls[0]![0] as Record<string, unknown>[])[0]!;
  }

  it('追加の貼紙は「追加画像」で記録し、フォームで選んでいた点検工事案内で点検行に結び付ける', async () => {
    const row = await submitCustomEntry();
    expect(row).toMatchObject({
      inspection_type: '追加画像',
      poster_type: 'custom',
      property_inspection_id: 'i-clean',
      vendor_id: 'v-mine',
      target_month: `${String(row.inspection_start).slice(0, 7)}-01`,
    });
  });

  it('点検行が読めなければ結び付けずに申請し、成功の知らせにその旨を足す', async () => {
    portalApi.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const row = await submitCustomEntry();
    expect(row).not.toHaveProperty('property_inspection_id');
    expect(await screen.findByText('1件を申請しました（点検予定には結び付けていません）')).toBeInTheDocument();
  });
});

describe('1件入力画面（物件を選んだときの点検工事案内。修正依頼1024 本番確認 ②）', () => {
  it('物件を選ぶとその物件の点検行の点検種別を入れ（自動で入った紐付けの既定は置き換える）、手で選んだ種別は保つ。追加の貼紙でも欄は見える', async () => {
    portalApi.extra = [
      { inspection_id: 'i-ev', property_code: '2010', inspection_type_label: 'エレベーター定期点検', vendor_id: 'v-mine', inspection_months: [] },
    ];
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    const typeBox = () => screen.getByRole('combobox', { name: '点検工事案内 *' });
    await waitFor(() => expect(typeBox()).toHaveValue('排水管清掃'));

    pick('物件コード *', '2010');
    await waitFor(() => expect(typeBox()).toHaveValue('エレベーター定期点検'));

    // 手で選んだ点検種別は、物件を選び直しても変えない
    pick('点検工事案内 *', '外壁');
    pick('物件コード *', 'z0015A01');
    expect(typeBox()).toHaveValue('外壁工事');

    // 追加の貼紙でも点検工事案内の欄は出る（選び忘れで点検予定に結び付かないように）
    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    expect(typeBox()).toHaveValue('外壁工事');
  });

  it('カテゴリで選び直した点検種別は、点検行の無い物件を選んでも紐付けの先頭に置き換えない', async () => {
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    const typeBox = () => screen.getByRole('combobox', { name: '点検工事案内 *' });
    await waitFor(() => expect(typeBox()).toHaveValue('排水管清掃'));
    fireEvent.change(screen.getByLabelText('案内カテゴリ'), { target: { value: '点検' } });
    expect(typeBox()).toHaveValue('エレベーター定期点検');
    // 120273-00 には点検行が無い
    pick('物件コード *', '120273-00');
    expect(typeBox()).toHaveValue('エレベーター定期点検');
    expect(screen.getByLabelText('案内カテゴリ')).toHaveValue('点検');
  });
});

describe('1件入力画面（記録する保守会社。修正依頼1024 本番確認 ③・ユーザー決定 2026-10-25）', () => {
  it('点検予定に結び付かない申請も、保守会社のアカウントは自社の社名・緊急連絡先で記録する（v1 の社名順の先頭ではない）', async () => {
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole('combobox', { name: '点検工事案内 *' })).toHaveValue('排水管清掃'));
    // 120273-00 には点検行が無いので結び付かない
    pick('物件コード *', '120273-00');
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    await waitFor(() => expect(insertEntries).toHaveBeenCalledTimes(1));
    const row = (insertEntries.mock.calls[0]![0] as Record<string, unknown>[])[0]!;
    expect(row).not.toHaveProperty('property_inspection_id');
    expect(row).toMatchObject({ vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱', emergency_contact: '0120-000-000' });
  });
});
