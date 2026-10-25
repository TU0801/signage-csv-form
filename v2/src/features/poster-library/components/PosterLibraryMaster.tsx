import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { POSTER_PNG_SIZE } from '@/lib/constants';
import { preparePosterImage } from '@/lib/pdfToPng';
import { safePosterUrl } from '@/lib/posterUrl';
import { fetchManagementCompanies } from '@/lib/api/portal';
import { fetchOwnManagementCompany } from '@/lib/api/users';
import {
  LIBRARY_CATEGORIES,
  createLibraryItem,
  fetchLibraryRows,
  updateLibraryItem,
  type PosterLibraryRow,
} from '@/lib/api/poster-library';
import type { ManagementCompanyRow } from '@/types/portal';

/** 全社共通（management_company_id が null）の選択肢の値 */
const COMMON = '';

/**
 * マスター管理の「貼紙ライブラリ」タブ（修正依頼1025 D2）。文字を合成しない貼紙（騒音注意・駐車禁止など）を登録する。
 * 管理者は全社共通と各管理会社の分、管理会社は自社分だけ登録・編集・無効化できる（DB の RLS と Storage ポリシーでも守る）。
 * 登録した貼紙は、1件入力・一括入力の詳細設定の「ライブラリから選ぶ」で、その管理会社の物件の申請でだけ選べる（全社共通はどの物件でも）
 */
export function PosterLibraryMaster() {
  const { addToast } = useToast();
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin');
  const ownCompanyId = useAuthStore((s) => s.profile?.management_company_id ?? null);
  const [rows, setRows] = useState<PosterLibraryRow[] | null>(null);
  const [companies, setCompanies] = useState<ManagementCompanyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PosterLibraryRow | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchLibraryRows());
    } catch (e) {
      console.error('貼紙ライブラリの取得に失敗しました:', e);
      setError('貼紙ライブラリを読み込めませんでした');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (isAdmin ? fetchManagementCompanies() : fetchOwnManagementCompany())
      .then((list) => {
        if (!cancelled) setCompanies(list);
      })
      .catch((e: unknown) => console.error('管理会社の取得に失敗しました:', e));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const companyName = useCallback(
    (id: string | null) =>
      id ? (companies.find((c) => c.id === id)?.name ?? '管理会社') : '全社共通',
    [companies],
  );

  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (showInactive || r.is_active) &&
          (scopeFilter === 'all' || (r.management_company_id ?? COMMON) === scopeFilter),
      ),
    [rows, showInactive, scopeFilter],
  );

  /** この行を書き換えられるか（管理者は全部、管理会社は自社分だけ） */
  const canEdit = (r: PosterLibraryRow) =>
    isAdmin || (!!ownCompanyId && r.management_company_id === ownCompanyId);

  const toggleActive = async (r: PosterLibraryRow) => {
    setBusyId(r.id);
    try {
      await updateLibraryItem(r, { is_active: !r.is_active });
      addToast(
        r.is_active
          ? `「${r.display_name}」を無効にしました`
          : `「${r.display_name}」を有効にしました`,
        'success',
      );
      await load();
    } catch (e) {
      console.error('貼紙ライブラリの更新に失敗しました:', e);
      addToast('更新に失敗しました', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              貼紙ライブラリ（{shown.length}件）
            </h2>
            <select
              aria-label="対象で絞り込み"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="all">すべて</option>
              <option value={COMMON}>全社共通</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              無効も表示
            </label>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              更新
            </Button>
            <Button
              size="sm"
              onClick={() => setEditing('new')}
              disabled={!isAdmin && !ownCompanyId}
            >
              ＋貼紙を登録
            </Button>
          </div>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          文字を合成しない貼紙（騒音注意・駐車禁止など）です。点検の貼紙（テンプレート）とは別に置きます。1件入力・一括入力の詳細設定の「ライブラリから選ぶ」「＋ライブラリから追加」で選べます。
          {isAdmin
            ? '全社共通はどの物件でも、管理会社の分はその管理会社の物件の申請でだけ選べます。'
            : '登録した貼紙は自社が管理する物件の申請でだけ選べます（全社共通は管理者が登録します）。'}
          使わなくなった貼紙は無効にします（申請済みの貼紙はそのまま残ります）。
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <p className="px-3 py-4 text-sm text-red-600">{error}</p>
        ) : !rows ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">登録された貼紙はありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="cell-head font-medium text-gray-500">画像</th>
                  <th className="cell-head font-medium text-gray-500">名前</th>
                  <th className="cell-head font-medium text-gray-500">カテゴリ</th>
                  <th className="cell-head font-medium text-gray-500">対象</th>
                  <th className="cell-head font-medium text-gray-500">並び順</th>
                  <th className="cell-head font-medium text-gray-500">状態</th>
                  <th className="cell-head font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const url = safePosterUrl(r.image_url);
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-gray-100 hover:bg-gray-50',
                        !r.is_active && 'opacity-60',
                      )}
                    >
                      <td className="cell">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="画像を別のタブで開く"
                          >
                            <img
                              src={url}
                              alt={r.display_name}
                              loading="lazy"
                              className="h-14 w-10 rounded border border-gray-200 bg-white object-contain"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-red-600">表示できない URL</span>
                        )}
                      </td>
                      <td className="cell text-sm text-gray-900">{r.display_name}</td>
                      <td className="cell text-sm text-gray-700">{r.category}</td>
                      <td className="cell text-sm text-gray-700">
                        {companyName(r.management_company_id)}
                      </td>
                      <td className="cell text-sm text-gray-700">{r.sort_order}</td>
                      <td className="cell text-sm">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            r.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {r.is_active ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="cell whitespace-nowrap">
                        {canEdit(r) ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditing(r)}
                              disabled={busyId !== null}
                            >
                              編集
                            </Button>
                            <Button
                              size="sm"
                              variant={r.is_active ? 'danger' : 'secondary'}
                              onClick={() => void toggleActive(r)}
                              disabled={busyId !== null}
                            >
                              {busyId === r.id
                                ? '更新中…'
                                : r.is_active
                                  ? '無効にする'
                                  : '有効にする'}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">閲覧のみ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <LibraryFormModal
        target={editing}
        isAdmin={isAdmin}
        ownCompanyId={ownCompanyId}
        companies={companies}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </Card>
  );
}

interface LibraryFormModalProps {
  target: PosterLibraryRow | 'new' | null;
  isAdmin: boolean;
  ownCompanyId: string | null;
  companies: ManagementCompanyRow[];
  onClose: () => void;
  onSaved: () => void;
}

/** 登録・編集のモーダル（画像・名前・カテゴリ・並び順。新規の管理者だけ対象＝全社共通か管理会社を選ぶ） */
function LibraryFormModal({
  target,
  isAdmin,
  ownCompanyId,
  companies,
  onClose,
  onSaved,
}: LibraryFormModalProps) {
  const open = target !== null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target === 'new' ? '貼紙を登録' : '貼紙を編集'}
      className="max-w-2xl"
    >
      {open && (
        <LibraryForm
          key={target === 'new' ? 'new' : target.id}
          row={target === 'new' ? null : target}
          isAdmin={isAdmin}
          ownCompanyId={ownCompanyId}
          companies={companies}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function LibraryForm({
  row,
  isAdmin,
  ownCompanyId,
  companies,
  onCancel,
  onSaved,
}: {
  row: PosterLibraryRow | null;
  isAdmin: boolean;
  ownCompanyId: string | null;
  companies: ManagementCompanyRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(row?.display_name ?? '');
  const [category, setCategory] = useState(row?.category ?? 'その他');
  const [sortOrder, setSortOrder] = useState(String(row?.sort_order ?? 0));
  // 管理者は全社共通か管理会社を選ぶ。管理会社は自社だけ（変えられない）
  const [scope, setScope] = useState<string>(
    row ? (row.management_company_id ?? COMMON) : isAdmin ? COMMON : (ownCompanyId ?? COMMON),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(row ? safePosterUrl(row.image_url) : null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    setPreparing(true);
    try {
      // PDF は1ページ目を PNG にする（申請の追加の貼紙と同じ）
      const prepared = await preparePosterImage(picked);
      setFile(prepared.file);
      if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/, ''));
      if (prepared.notice) addToast(prepared.notice, 'info');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '画像を選択できませんでした', 'error');
    } finally {
      setPreparing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('名前を入力してください', 'error');
      return;
    }
    if (!category.trim()) {
      addToast('カテゴリを入力してください', 'error');
      return;
    }
    if (!row && !file) {
      addToast('画像を選択してください', 'error');
      return;
    }
    const input = {
      display_name: name.trim(),
      category: category.trim(),
      sort_order: parseInt(sortOrder, 10) || 0,
    };
    setSaving(true);
    try {
      if (row) {
        await updateLibraryItem(row, input, file ?? undefined);
      } else {
        await createLibraryItem({ ...input, management_company_id: scope || null }, file!);
      }
      addToast(row ? '保存しました' : '登録しました', 'success');
      onSaved();
    } catch (err) {
      console.error('貼紙ライブラリの保存に失敗しました:', err);
      addToast(`保存に失敗しました: ${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const scopeOptions = isAdmin
    ? [{ id: COMMON, name: '全社共通（どの物件でも選べる）' }, ...companies]
    : companies.filter((c) => c.id === ownCompanyId);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="space-y-2">
          <Input
            id="pl-name"
            label="名前"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 騒音注意"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label htmlFor="pl-category" className="block text-xs font-medium text-gray-600">
                カテゴリ
              </label>
              <input
                id="pl-category"
                list="pl-category-options"
                value={category}
                maxLength={50}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <datalist id="pl-category-options">
                {LIBRARY_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Input
              id="pl-sort"
              label="並び順"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="space-y-0.5">
            <label htmlFor="pl-scope" className="block text-xs font-medium text-gray-600">
              対象（どの物件の申請で選べるか）
            </label>
            <select
              id="pl-scope"
              value={scope}
              disabled={!!row || !isAdmin}
              onChange={(e) => setScope(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
            >
              {scopeOptions.map((c) => (
                <option key={c.id || 'common'} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {row && (
              <p className="text-xs text-gray-500">
                対象は登録後に変えられません（変えるときは登録し直します）
              </p>
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-600">
              画像{row ? '（差し替えるときだけ選ぶ）' : ''}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              className="hidden"
              aria-label="貼紙ライブラリの画像"
              onChange={(e) => void handleFile(e)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={preparing || saving}
              onClick={() => fileRef.current?.click()}
            >
              {preparing ? '変換中…' : file || row ? '画像を変更' : '画像を選択'}
            </Button>
            <p className="text-xs text-gray-500">
              JPG, PNG, PDF形式（5MB以下）。PDF は1ページ目を {POSTER_PNG_SIZE.width}×
              {POSTER_PNG_SIZE.height} の PNG に変換します
            </p>
          </div>
        </div>
        <div className="flex items-start justify-center">
          {preview ? (
            <img
              src={preview}
              alt="貼紙のプレビュー"
              className="max-h-60 w-auto max-w-full rounded border border-gray-200 object-contain"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center rounded-md bg-slate-50 text-xs text-gray-500">
              画像を選択してください
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          キャンセル
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || preparing}>
          {saving ? '保存中…' : row ? '保存' : '登録'}
        </Button>
      </div>
    </div>
  );
}
