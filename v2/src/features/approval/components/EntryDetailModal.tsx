import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { DbEntry } from '@/types/database';
import { normalizeTerminalId } from '@/lib/terminal';
import {
  entryApprovalLabel,
  formatJaDate,
  formatJaDateTime,
} from '@/features/entries-list/lib/entries';

interface EntryDetailModalProps {
  entry: DbEntry | null;
  onClose: () => void;
  emailOf: (userId: string | null | undefined) => string;
  displayDefault: number;
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

/** エントリ詳細（データ一覧・承認待ちの両方から開く） */
// v1: js/admin-entries.js showEntryDetail
export function EntryDetailModal({ entry, onClose, emailOf, displayDefault }: EntryDetailModalProps) {
  if (!entry) return null;

  const isCustom = entry.poster_type === 'custom';

  return (
    <Modal
      open
      onClose={onClose}
      title="エントリ詳細"
      className="max-w-4xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          閉じる
        </Button>
      }
    >
      {/* FHD（2xl）では区分を2段組みにして縦の長さを抑える（上から順に左の列、右の列へ流す） */}
      <div className="gap-x-6 2xl:columns-2">
        <Section>
          <DetailRow label="物件コード">{entry.property_code}</DetailRow>
          <DetailRow label="端末ID">{normalizeTerminalId(entry.terminal_id) || '-'}</DetailRow>
          <DetailRow label="保守会社">{entry.vendor_name}</DetailRow>
          <DetailRow label="緊急連絡先">{entry.emergency_contact || '-'}</DetailRow>
          <DetailRow label="点検工事案内">{entry.inspection_type}</DetailRow>
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
          <DetailRow label="表示位置">{entry.poster_position || '-'}</DetailRow>
          <DetailRow label="貼紙区分">{isCustom ? '追加' : 'テンプレート'}</DetailRow>
          {isCustom && entry.poster_image && (
            <DetailRow label="貼紙画像">
              <img
                src={entry.poster_image}
                alt="貼紙画像"
                className="max-h-[200px] max-w-[200px] rounded border border-gray-200"
              />
            </DetailRow>
          )}
        </Section>

        <Section title="案内文・作業時間 及び 備考">
          <DetailRow label="案内文">{entry.announcement || '-'}</DetailRow>
          <DetailRow label="作業時間 及び 備考">{entry.remarks || '-'}</DetailRow>
        </Section>

        <Section title="登録情報">
          <DetailRow label="登録者">{emailOf(entry.user_id)}</DetailRow>
          <DetailRow label="登録日時">{formatJaDateTime(entry.created_at)}</DetailRow>
          <DetailRow label="ステータス">{entryApprovalLabel(entry.status)}</DetailRow>
        </Section>
      </div>
    </Modal>
  );
}
