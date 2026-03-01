import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import type { DbEntry } from '@/types/database';
import { formatDateSlash } from '@/lib/utils';

interface EntryDetailModalProps {
  open: boolean;
  onClose: () => void;
  entry: DbEntry | null;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex border-b border-gray-100 py-2">
      <dt className="w-40 shrink-0 text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '-'}</dd>
    </div>
  );
}

export function EntryDetailModal({ open, onClose, entry }: EntryDetailModalProps) {
  if (!entry) return null;

  const statusVariant = {
    pending: 'warning' as const,
    draft: 'default' as const,
    ready: 'success' as const,
    exported: 'primary' as const,
  };

  return (
    <Modal open={open} onClose={onClose} title="エントリー詳細" className="max-w-2xl">
      <dl className="space-y-0">
        <DetailRow label="物件コード" value={entry.property_code} />
        <DetailRow label="端末ID" value={entry.terminal_id} />
        <DetailRow label="保守会社" value={entry.vendor_name} />
        <DetailRow label="緊急連絡先" value={entry.emergency_contact} />
        <DetailRow label="点検種別" value={entry.inspection_type} />
        <DetailRow label="テンプレートNo" value={entry.template_no} />
        <DetailRow
          label="点検期間"
          value={
            entry.inspection_start && entry.inspection_end
              ? `${formatDateSlash(entry.inspection_start)} - ${formatDateSlash(entry.inspection_end)}`
              : entry.inspection_start
                ? formatDateSlash(entry.inspection_start)
                : null
          }
        />
        <DetailRow
          label="表示開始日"
          value={entry.display_start_date ? formatDateSlash(entry.display_start_date) : null}
        />
        <DetailRow
          label="表示終了日"
          value={entry.display_end_date ? formatDateSlash(entry.display_end_date) : null}
        />
        <DetailRow label="表示開始時刻" value={entry.display_start_time} />
        <DetailRow label="表示終了時刻" value={entry.display_end_time} />
        <DetailRow
          label="表示時間"
          value={entry.display_duration != null ? `${entry.display_duration}秒` : null}
        />
        <DetailRow label="案内文" value={entry.announcement} />
        <DetailRow label="備考" value={entry.remarks} />
        <DetailRow label="貼紙区分" value={entry.poster_type} />
        <DetailRow label="フレームNo" value={entry.frame_no} />
        <div className="flex border-b border-gray-100 py-2">
          <dt className="w-40 shrink-0 text-sm font-medium text-gray-500">ステータス</dt>
          <dd>
            <Badge variant={entry.status ? (statusVariant[entry.status] ?? 'default') : 'default'}>
              {entry.status ?? '-'}
            </Badge>
          </dd>
        </div>
        <DetailRow
          label="作成日時"
          value={entry.created_at ? formatDateSlash(entry.created_at) : null}
        />
      </dl>
    </Modal>
  );
}
