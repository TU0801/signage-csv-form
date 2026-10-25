import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useEntryLookups } from '@/features/entries-list/hooks/useEntryLookups';
import { fetchCustomImageEntries } from '@/lib/api/custom-images';
import { customImageBaseName } from '@/lib/csv';
import { parseExtraPosters } from '@/lib/extraPosters';
import { safePosterUrl } from '@/lib/posterUrl';
import type { CustomImageFile } from '@/lib/zipDownload';
import { cn } from '@/lib/utils';
import type { DbEntry } from '@/types/database';
import { useRefetchOnVisible } from '../hooks/useRefetchOnVisible';
import { OrphanImagesModal } from './OrphanImagesModal';

const STATUS_LABEL: Record<string, string> = {
  pending: '未申請',
  draft: '承認待ち',
  ready: '承認済み',
  exported: '取込済み',
};
const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  exported: 'bg-emerald-100 text-emerald-700',
};

function formatDay(d: string | null): string {
  return d ? d.replace(/-/g, '/') : '';
}

/** 点検期間（開始〜終了。同じ日なら1日） */
export function entryPeriod(e: Pick<DbEntry, 'inspection_start' | 'inspection_end'>): string {
  if (!e.inspection_start) return '-';
  return e.inspection_end && e.inspection_end !== e.inspection_start
    ? `${formatDay(e.inspection_start)}〜${formatDay(e.inspection_end)}`
    : formatDay(e.inspection_start);
}

/** 一覧の1行（申請の追加画像1枚）。2枚目以降の貼紙（修正依頼1025 D3）も1枚ずつ行にする */
interface ImageRow {
  key: string;
  entry: DbEntry;
  /** 何枚目か（1 は申請の1枚目の貼紙） */
  nth: number;
  /** このプロジェクトの poster-images の URL（それ以外は null＝表示しない） */
  url: string | null;
  /** ZIP 内・個別 DL のファイル名（拡張子なし）＝ CSV の点検案内TPLNo */
  baseName: string;
}

/** 申請を画像ごとの行にする（1枚目が追加の貼紙ならその画像、続けて2枚目以降の貼紙） */
export function imageRowsOf(entries: DbEntry[]): ImageRow[] {
  return entries.flatMap((e) => {
    const rows: ImageRow[] = [];
    if (e.poster_type === 'custom' && e.poster_image) {
      rows.push({ key: `${e.id}:1`, entry: e, nth: 1, url: safePosterUrl(e.poster_image), baseName: customImageBaseName(e) });
    }
    parseExtraPosters(e.extra_posters).forEach((x, i) => {
      rows.push({
        key: `${e.id}:${i + 2}`,
        entry: e,
        nth: i + 2,
        url: safePosterUrl(x.image_url),
        baseName: `${customImageBaseName(e)}_${i + 2}`,
      });
    });
    return rows;
  });
}

/** 承認待ちの3つ目のタブ: 貼紙で「追加」を選んで登録された画像（状態は問わない。承認待ちが先頭） */
export function CustomImagesList({ onCount, canCleanup = false }: { onCount?: (n: number) => void; canCleanup?: boolean }) {
  const { addToast } = useToast();
  const { propertyNames } = useEntryLookups();
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | 'all' | null>(null);
  const [orphanOpen, setOrphanOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCustomImageEntries();
      setEntries(rows);
      onCount?.(rows.length);
    } catch (err) {
      console.error('Failed to load custom images:', err);
      setError('追加登録された画像の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnVisible(load, !loading && downloading === null);

  // 画像の URL はこのプロジェクトの poster-images のものだけ扱う（保守会社が書ける値なので）
  const imageRows = imageRowsOf(entries);
  const downloadable = entries.filter((e) => imageRows.some((r) => r.entry === e && r.url));
  const downloadableCount = imageRows.filter((r) => r.url).length;

  const downloadOne = async (row: ImageRow) => {
    if (!row.url) return;
    setDownloading(row.key);
    try {
      const { downloadCustomImage } = await import('@/lib/zipDownload');
      const file: CustomImageFile = { url: row.url, baseName: row.baseName };
      await downloadCustomImage(row.entry, file);
    } catch (err) {
      console.error('Failed to download custom image:', err);
      addToast('画像のダウンロードに失敗しました', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    if (downloadable.length === 0) {
      addToast('ダウンロード対象の追加画像がありません', 'info');
      return;
    }
    addToast(`${downloadableCount}件の画像をダウンロード中...`, 'info');
    setDownloading('all');
    try {
      const { downloadCustomImages } = await import('@/lib/zipDownload');
      const done = await downloadCustomImages(downloadable, 'all');
      addToast(`${done}件の画像をダウンロードしました`, 'success');
    } catch (err) {
      console.error('Failed to download custom images:', err);
      addToast('画像のダウンロードに失敗しました', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            追加登録された画像 ({entries.length}件{imageRows.length !== entries.length ? `・${imageRows.length}枚` : ''})
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              更新
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={downloadAll}
              disabled={downloading !== null}
            >
              {downloading === 'all' ? 'DL中...' : 'まとめてDL'}
            </Button>
            {canCleanup && (
              <Button size="sm" variant="secondary" onClick={() => setOrphanOpen(true)}>
                使われていない画像を整理
              </Button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          貼紙で「追加」を選んだ画像と、2枚目以降に追加した貼紙です（状態は問いません。承認待ちを先頭に表示）。ZIP
          内のファイル名は CSV の点検案内TPLNo と同じです。
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <div className="px-3 py-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()} className="mt-2">
              再読み込み
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">
            追加登録された画像はありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="cell-head font-medium text-gray-500">画像</th>
                  <th className="cell-head font-medium text-gray-500">物件</th>
                  <th className="cell-head font-medium text-gray-500">点検種別</th>
                  <th className="cell-head font-medium text-gray-500">保守会社</th>
                  <th className="cell-head font-medium text-gray-500">点検期間</th>
                  <th className="cell-head font-medium text-gray-500">状態</th>
                  <th className="cell-head font-medium text-gray-500">登録日時</th>
                  <th className="cell-head font-medium text-gray-500">DL</th>
                </tr>
              </thead>
              <tbody>
                {imageRows.map((row) => {
                  const { entry: e, url } = row;
                  const status = e.status ?? '';
                  return (
                    <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="cell">
                        <div className="flex items-center gap-1.5">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="画像を別のタブで開く"
                            >
                              <img
                                src={url}
                                alt={`${e.property_code} ${e.inspection_type} の追加画像`}
                                loading="lazy"
                                className="h-12 w-9 rounded border border-gray-200 bg-white object-contain"
                              />
                            </a>
                          ) : (
                            <span className="text-xs text-red-600">表示できない URL</span>
                          )}
                          <div className="text-[11px] leading-tight text-gray-500">
                            {row.nth > 1 && <div className="font-medium text-blue-700">{row.nth}枚目</div>}
                            <div className="max-w-[12rem] break-all">{row.baseName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="cell text-sm">
                        <div className="whitespace-nowrap text-gray-500">{e.property_code}</div>
                        <div
                          className="max-w-[16rem] truncate text-gray-900"
                          title={propertyNames.get(e.property_code) || undefined}
                        >
                          {propertyNames.get(e.property_code) || '-'}
                        </div>
                      </td>
                      <td className="cell text-sm text-gray-900">{e.inspection_type || '-'}</td>
                      <td className="cell text-sm text-gray-900">
                        <div className="max-w-[14rem] truncate" title={e.vendor_name || undefined}>
                          {e.vendor_name || '-'}
                        </div>
                      </td>
                      <td className="cell whitespace-nowrap text-sm text-gray-700">
                        {entryPeriod(e)}
                      </td>
                      <td className="cell whitespace-nowrap">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {STATUS_LABEL[status] ?? (status || '-')}
                        </span>
                      </td>
                      <td className="cell whitespace-nowrap text-sm text-gray-500">
                        {e.created_at ? new Date(e.created_at).toLocaleString('ja-JP') : '-'}
                      </td>
                      <td className="cell">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void downloadOne(row)}
                          disabled={!url || downloading !== null}
                          aria-label={`${e.property_code} ${e.inspection_type} の画像${row.nth > 1 ? `（${row.nth}枚目）` : ''}をダウンロード`}
                        >
                          {downloading === row.key ? 'DL中...' : 'DL'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {canCleanup && <OrphanImagesModal open={orphanOpen} onClose={() => setOrphanOpen(false)} />}
    </Card>
  );
}
