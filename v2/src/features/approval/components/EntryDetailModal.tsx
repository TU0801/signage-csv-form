import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { DbEntry } from '@/types/database';
import { normalizeTerminalId } from '@/lib/terminal';
import { safePosterUrl } from '@/lib/posterUrl';
import {
  entryStatusLabel,
  formatJaDate,
  formatJaDateTime,
  posterPositionLabel,
} from '@/features/entries-list/lib/entries';

interface EntryDetailModalProps {
  entry: DbEntry | null;
  onClose: () => void;
  /** 物件コード → 物件名（物件の行に名前も出す） */
  propertyNames: Map<string, string>;
  emailOf: (userId: string | null | undefined) => string;
  displayDefault: number;
  /** 承認待ちから開いたときだけ渡す。詳細を確かめたまま承認・却下・編集へ進めるようにする */
  onApprove?: (entry: DbEntry) => void;
  onReject?: (entry: DbEntry) => void;
  onEdit?: (entry: DbEntry) => void;
  /** 差戻し（管理会社。却下＝削除の代わりに理由を付けて保守会社へ戻す） */
  onSendBack?: (entry: DbEntry) => void;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex border-b border-gray-100 py-1.5">
      <dt className="w-36 shrink-0 text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap break-all">{children}</dd>
    </div>
  );
}

// 見出しの無い区分（先頭の基本情報）もあるので title は任意。
// 2列のときに区分が列の途中で割れないようにし、区分どうしの間隔は下の余白で取る（margin だと列の先頭で消えない）
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid pb-3">
      {title && <h3 className="mb-1 text-sm font-semibold text-gray-700">{title}</h3>}
      <dl>{children}</dl>
    </div>
  );
}

/** 申請内容の詳細（承認済み・承認待ちの両方から開く） */
// v1: js/admin-entries.js showEntryDetail
export function EntryDetailModal({
  entry,
  onClose,
  propertyNames,
  emailOf,
  displayDefault,
  onApprove,
  onReject,
  onEdit,
  onSendBack,
}: EntryDetailModalProps) {
  if (!entry) return null;

  const isCustom = entry.poster_type === 'custom';
  const posterUrl = safePosterUrl(entry.poster_image);

  return (
    <Modal
      open
      onClose={onClose}
      title="申請内容の詳細"
      className="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            閉じる
          </Button>
          {onEdit && (
            <Button variant="secondary" onClick={() => onEdit(entry)}>
              編集
            </Button>
          )}
          {onReject && (
            <Button variant="danger" onClick={() => onReject(entry)}>
              却下
            </Button>
          )}
          {onSendBack && (
            <Button variant="danger" onClick={() => onSendBack(entry)}>
              差戻し
            </Button>
          )}
          {onApprove && (
            <Button variant="success" onClick={() => onApprove(entry)}>
              承認
            </Button>
          )}
        </>
      }
    >
      {/* FHD（2xl）では区分を2段組みにして縦の長さを抑える（上から順に左の列、右の列へ流す） */}
      <div className="gap-x-6 2xl:columns-2">
        <Section>
          <DetailRow label="物件">
            {entry.property_code} {propertyNames.get(entry.property_code) || ''}
          </DetailRow>
          <DetailRow label="端末ID">{normalizeTerminalId(entry.terminal_id) || '-'}</DetailRow>
          <DetailRow label="保守会社">{entry.vendor_name}</DetailRow>
          <DetailRow label="緊急連絡先">{entry.emergency_contact || '-'}</DetailRow>
          <DetailRow label="点検種別">{entry.inspection_type}</DetailRow>
          <DetailRow label="テンプレートNo">{entry.template_no || '-'}</DetailRow>
        </Section>

        <Section title="点検期間">
          <DetailRow label="開始日">{formatJaDate(entry.inspection_start)}</DetailRow>
          <DetailRow label="終了日">{formatJaDate(entry.inspection_end)}</DetailRow>
        </Section>

        <Section title="表示設定">
          <DetailRow label="表示開始">
            {formatJaDate(entry.display_start_date)} {entry.display_start_time || ''}
          </DetailRow>
          <DetailRow label="表示終了">
            {formatJaDate(entry.display_end_date)} {entry.display_end_time || ''}
          </DetailRow>
          <DetailRow label="表示時間">{entry.display_duration || displayDefault}秒</DetailRow>
          <DetailRow label="表示位置">{posterPositionLabel(entry.poster_position)}</DetailRow>
          <DetailRow label="貼紙区分">{isCustom ? '追加' : 'テンプレート'}</DetailRow>
          {isCustom && entry.poster_image && (
            <DetailRow label="貼紙画像">
              {/* 値は保守会社が書けるので、このプロジェクトの poster-images の URL だけを出す（点検一覧の詳細と同じ） */}
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt="貼紙画像"
                  className="max-h-[200px] max-w-[200px] rounded border border-gray-200"
                />
              ) : (
                <span className="text-gray-500">表示できない画像の URL です</span>
              )}
            </DetailRow>
          )}
        </Section>

        <Section title="案内文・作業時間 及び 備考">
          <DetailRow label="案内文">{entry.announcement || '-'}</DetailRow>
          <DetailRow label="作業時間 及び 備考">{entry.remarks || '-'}</DetailRow>
          {/* 申請者のメモ（CSV・掲示には出さない。点検月の変更などの覚え書き。修正依頼1024 B12） */}
          <DetailRow label="メモ（CSV外）">
            <span className="whitespace-pre-line">{entry.memo || '-'}</span>
          </DetailRow>
        </Section>

        <Section title="登録情報">
          <DetailRow label="登録者">{emailOf(entry.user_id)}</DetailRow>
          <DetailRow label="登録日時">{formatJaDateTime(entry.created_at)}</DetailRow>
          <DetailRow label="ステータス">{entryStatusLabel(entry.status)}</DetailRow>
        </Section>
      </div>
    </Modal>
  );
}
