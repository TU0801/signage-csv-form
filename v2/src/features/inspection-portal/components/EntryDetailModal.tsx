import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { normalizeTerminalId } from '@/lib/terminal';
import { safePosterUrl } from '@/lib/posterUrl';
import type { PortalEntryRow } from '@/types/portal';
import type { ExtraPoster } from '@/lib/extraPosters';
import { fetchEntryExtraPosters } from '../lib/entryApi';
import { formatDate, todayJst } from '../lib/schedule';

export interface EntryDetailTarget {
  entry: PortalEntryRow;
  /** 何の申請か（対象月・物件・点検種別） */
  subject: string;
  /** 同じ予定の申請（新しい順）。差戻しの履歴を出すのに使う */
  history: PortalEntryRow[];
}

interface EntryDetailModalProps {
  target: EntryDetailTarget | null;
  /** 承認・差戻しを送っている */
  busy: boolean;
  onClose: () => void;
  /** 承認する。失敗したら throw（モーダルは開いたまま） */
  onApprove: (entry: PortalEntryRow) => Promise<void>;
  /** 差戻しの理由を聞くダイアログへ進む（このモーダルは閉じる） */
  onSendBack: (entry: PortalEntryRow) => void;
}

const POSTER_LABEL: Record<string, string> = { template: 'テンプレート', custom: '追加画像' };

const STATUS_LABEL: Record<PortalEntryRow['status'], string> = {
  pending: '未申請',
  draft: '申請済み（承認待ち）',
  ready: '承認済み',
  exported: '取込済み',
};

function range(start: string | null, end: string | null): string {
  if (!start) return '－';
  return end && end !== start ? `${formatDate(start)}〜${formatDate(end)}` : formatDate(start);
}

function dateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  return time ? `${formatDate(date)} ${time.slice(0, 5)}` : formatDate(date);
}

function displayRange(e: PortalEntryRow): string {
  const start = dateTime(e.display_start_date, e.display_start_time);
  const end = dateTime(e.display_end_date, e.display_end_time);
  if (!start && !end) return '－';
  return `${start || '－'}〜${end || '－'}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-gray-500">{label}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </>
  );
}

function TextBlock({ text }: { text: string | null }) {
  if (!text?.trim()) return <span className="text-gray-400">（なし）</span>;
  return <div className="whitespace-pre-line rounded border border-gray-200 bg-gray-50 px-2 py-1">{text}</div>;
}

type ExtrasState =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'loaded'; items: ExtraPoster[] };

/** 開いている申請の2枚目以降の貼紙を読む（申請が変わったら読み直す。前の申請の結果は使わない） */
function useEntryExtraPosters(id: string | null): ExtrasState {
  const [result, setResult] = useState<{ id: string; items: ExtraPoster[] | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchEntryExtraPosters(id)
      .then((items) => {
        if (!cancelled) setResult({ id, items });
      })
      .catch((e: unknown) => {
        console.error('追加の貼紙の取得に失敗しました:', e);
        if (!cancelled) setResult({ id, items: null });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (!id) return { state: 'none' };
  if (result?.id !== id) return { state: 'loading' };
  return result.items ? { state: 'loaded', items: result.items } : { state: 'error' };
}

/**
 * 申請の中身（掲示される内容）。承認した本文はそのまま長谷工向け CSV でサイネージへ出るので、
 * 管理会社が承認・差戻しの前にここで確かめる。承認は確認を挟む（取り消すには差戻しが要るため）
 */
export function EntryDetailModal({ target, busy, onClose, onApprove, onSendBack }: EntryDetailModalProps) {
  const [confirming, setConfirming] = useState(false);
  const entry = target?.entry ?? null;
  const posterUrl = safePosterUrl(entry?.poster_image);
  // 2枚目以降の貼紙（修正依頼1025 D3）。承認すると CSV に枚数分の行で出るので、読めるまで（読めなければ）承認させない
  const extras = useEntryExtraPosters(entry?.id ?? null);
  const extrasReady = extras.state === 'loaded';
  const canApprove = entry?.status === 'draft';
  const canSendBack = entry?.status === 'draft' || entry?.status === 'ready';
  // 差戻しの理由は差し戻された行に残り、再申請（draft）しても消えない（DB のトリガーが保つ）
  const sentBackHistory = (target?.history ?? []).filter(
    (e) => e.review_comment && (e.status === 'pending' || e.status === 'draft'),
  );

  return (
    <>
      <Modal
        open={!!target}
        onClose={onClose}
        title="申請の内容"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              閉じる
            </Button>
            {entry && canSendBack && (
              <Button
                variant={canApprove ? 'danger' : 'secondary'}
                size="sm"
                disabled={busy}
                onClick={() => onSendBack(entry)}
              >
                {canApprove ? '差戻し' : '承認を取り消して差戻し'}
              </Button>
            )}
            {canApprove && (
              <Button
                variant="success"
                size="sm"
                disabled={busy || !extrasReady}
                title={extrasReady ? undefined : '追加の貼紙を確かめてから承認できます'}
                onClick={() => setConfirming(true)}
              >
                承認
              </Button>
            )}
          </>
        }
      >
        {entry && (
          <div className="space-y-2 text-xs">
            <p className="text-sm font-medium text-gray-900">{target?.subject}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <Row label="状態">{STATUS_LABEL[entry.status]}</Row>
              <Row label="保守会社">{entry.vendor_name || '－'}</Row>
              <Row label="点検期間">{range(entry.inspection_start, entry.inspection_end)}</Row>
              <Row label="表示期間">{displayRange(entry)}</Row>
              <Row label="端末">{normalizeTerminalId(entry.terminal_id) || '（端末なし）'}</Row>
              <Row label="テンプレートNo">{entry.template_no || '－'}</Row>
              <Row label="貼紙">{entry.poster_type ? (POSTER_LABEL[entry.poster_type] ?? entry.poster_type) : '－'}</Row>
              {entry.poster_image && (
                <Row label="追加画像">
                  {/* poster-images は公開バケットなので URL をそのまま使える（それ以外の URL は出さない） */}
                  {posterUrl ? (
                  <a href={posterUrl} target="_blank" rel="noopener noreferrer" title="別のタブで開く">
                    <img
                      src={posterUrl}
                      alt="追加画像"
                      className="max-h-32 max-w-[12rem] rounded border border-gray-200 object-contain"
                    />
                  </a>
                  ) : (
                    <span className="text-gray-500">（画像の URL が不正なため表示しません）</span>
                  )}
                </Row>
              )}
              {extras.state === 'loading' && <Row label="追加の貼紙">読み込み中…</Row>}
              {extras.state === 'error' && (
                <Row label="追加の貼紙">
                  <span className="text-red-600">追加の貼紙を読み込めませんでした（承認するには画面を開き直してください）</span>
                </Row>
              )}
              {extras.state === 'loaded' && extras.items.length > 0 && (
                <Row label={`追加の貼紙（${extras.items.length}枚）`}>
                  <div className="flex flex-wrap gap-2" data-testid="portal-extra-posters">
                    {extras.items.map((x, i) => {
                      const url = safePosterUrl(x.image_url);
                      return (
                        <figure key={i} className="w-[96px] space-y-0.5">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" title="別のタブで開く">
                              <img
                                src={url}
                                alt={`${i + 2}枚目の貼紙`}
                                className="max-h-32 max-w-[96px] rounded border border-gray-200 object-contain"
                              />
                            </a>
                          ) : (
                            <span className="text-gray-500">（画像の URL が不正なため表示しません）</span>
                          )}
                          <figcaption className="text-[11px] leading-tight text-gray-600">
                            {i + 2}枚目・{x.source === 'library' ? 'ライブラリ' : 'アップロード'}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </Row>
              )}
              <Row label="案内文">
                <TextBlock text={entry.announcement} />
              </Row>
              <Row label="掲示備考">
                <TextBlock text={entry.remarks} />
              </Row>
              {sentBackHistory.length > 0 && (
                <Row label="差戻しの理由">
                  <ul className="space-y-0.5">
                    {sentBackHistory.map((e) => (
                      <li key={e.id} className="whitespace-pre-line text-amber-800">
                        {e.reviewed_at && (
                          <span className="mr-1 tabular-nums text-gray-500">{formatDate(todayJst(new Date(e.reviewed_at)))}</span>
                        )}
                        {e.status === 'draft' && <span className="mr-1 text-gray-500">（前回）</span>}
                        {e.review_comment}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
            </dl>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          // 失敗の知らせは呼び出し側がトーストで出す。成功したら呼び出し側がこのモーダルを閉じる
          if (entry) void onApprove(entry).catch(() => {});
        }}
        title="申請の承認"
        message={`${target?.subject ?? ''}\nこの内容で承認します。承認するとサイネージへ出す CSV の対象になります。`}
        confirmLabel="承認する"
      />
    </>
  );
}
