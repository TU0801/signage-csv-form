import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { fetchOrphanPosterImages, formatBytes, type OrphanPosterImage } from '@/lib/api/custom-images';
import { deletePosterObjects, getPublicUrl } from '@/lib/storage';

/**
 * 承認待ち＞追加登録された画像の「使われていない画像を整理」。
 * 利用者がアップロードしたまま、どの申請からも使われず7日以上たった貼紙画像を一覧し、確かめてから消す。
 * 一覧は RPC orphan_poster_images（管理者だけ）、削除は Storage API（管理者の DELETE ポリシー）。
 * 消す直前に一覧を取り直し、その間に申請で使われた画像は消さない
 */
export function OrphanImagesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addToast } = useToast();
  const [items, setItems] = useState<OrphanPosterImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchOrphanPosterImages());
    } catch (err) {
      console.error('Failed to load orphan poster images:', err);
      setError('使われていない画像の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const totalSize = items.reduce((sum, i) => sum + i.size, 0);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // 一覧を出してから押すまでの間に申請で使われた画像は外す（取り直した一覧にあるものだけ消す）
      const shown = new Set(items.map((i) => i.name));
      const latest = await fetchOrphanPosterImages();
      const targets = latest.filter((i) => shown.has(i.name)).map((i) => i.name);
      const deleted = await deletePosterObjects(targets);
      const skipped = items.length - deleted.length;
      addToast(
        `${deleted.length}件の画像を削除しました${skipped > 0 ? `（${skipped}件は使われ始めた・既に無いため残しました）` : ''}`,
        'success',
      );
      await load();
    } catch (err) {
      console.error('Failed to delete orphan poster images:', err);
      addToast(err instanceof Error ? err.message : '画像を削除できませんでした', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="使われていない画像を整理"
        className="max-w-4xl"
        busy={deleting}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={deleting}>
              閉じる
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={loading || deleting || items.length === 0}
            >
              {deleting ? '削除中…' : `${items.length}件を削除`}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            貼紙の「追加」でアップロードされたまま、どの申請からも使われていない画像です（作成から7日以上たったもの。
            テンプレート画像・広告画像は含みません）。
          </p>
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : error ? (
            <div>
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="secondary" size="sm" onClick={() => void load()} className="mt-2">
                再読み込み
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">使われていない画像はありません</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-800" data-testid="orphan-summary">
                {items.length}件・合計 {formatBytes(totalSize)}
              </p>
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="cell-head font-medium text-gray-500">画像</th>
                      <th className="cell-head font-medium text-gray-500">アップロードした人</th>
                      <th className="cell-head font-medium text-gray-500">作成日時</th>
                      <th className="cell-head text-right font-medium text-gray-500">サイズ</th>
                      <th className="cell-head font-medium text-gray-500">ファイル</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const url = getPublicUrl(i.name);
                      return (
                        <tr key={i.name} className="border-b border-gray-100">
                          <td className="cell">
                            <a href={url} target="_blank" rel="noopener noreferrer" title="画像を別のタブで開く">
                              <img
                                src={url}
                                alt={`${i.name} のサムネイル`}
                                loading="lazy"
                                className="h-12 w-9 rounded border border-gray-200 bg-white object-contain"
                              />
                            </a>
                          </td>
                          <td className="cell text-sm">
                            <div className="text-gray-900">{i.owner_email || '（ユーザー不明）'}</div>
                            {i.owner_company && <div className="text-xs text-gray-500">{i.owner_company}</div>}
                          </td>
                          <td className="cell whitespace-nowrap text-sm text-gray-700">
                            {new Date(i.created_at).toLocaleString('ja-JP')}
                          </td>
                          <td className="cell whitespace-nowrap text-right text-sm text-gray-700">{formatBytes(i.size)}</td>
                          <td className="cell max-w-[16rem] truncate text-xs text-gray-500" title={i.name}>
                            {i.name.split('/').pop()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void handleDelete()}
        title="使われていない画像の削除"
        message={`${items.length}件（合計 ${formatBytes(totalSize)}）の画像を削除します。元に戻せません。\n一括入力のテンプレート（各ブラウザに保存）に入れた画像が含まれていると、そのテンプレートの画像も表示されなくなります。`}
        confirmLabel="削除"
        variant="danger"
      />
    </>
  );
}
