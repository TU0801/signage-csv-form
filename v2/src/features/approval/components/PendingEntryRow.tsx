import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { DbEntry } from '@/types/database';
import {
  displayPeriodWarning,
  formatJaDate,
  formatJaDateTime,
} from '@/features/entries-list/lib/entries';
import { NAME_CELL } from '@/features/entries-list/lib/tableColumns';

interface PendingEntryRowProps {
  entry: DbEntry;
  selected: boolean;
  propertyName: string | undefined;
  email: string;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewDetail: (entry: DbEntry) => void;
  onEdit: (entry: DbEntry) => void;
}

const td = 'cell text-sm text-gray-900';
const nowrap = `${td} whitespace-nowrap`;
// 画面が狭いときは表を横にスクロールし、操作の列だけ右端に残す（行のホバー色は group で合わせる）
const actions = `${td} sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50`;

// 表示期間セルの2行目に出す短い理由
function periodWarningShort(warning: string): string {
  return warning.startsWith('表示終了日が表示開始日より前') ? '終了日が開始日より前' : '期限切れ';
}

// v1: js/admin-pending.js renderPendingEntries（1行分）
export function PendingEntryRow({
  entry,
  selected,
  propertyName,
  email,
  onToggleSelect,
  onApprove,
  onReject,
  onViewDetail,
  onEdit,
}: PendingEntryRowProps) {
  const periodWarning = displayPeriodWarning(entry);
  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50">
      <td className={td}>
        <input
          type="checkbox"
          aria-label="選択"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className={nowrap}>
        {entry.property_code}
        {/* 点検一覧（/portal）からの申請は管理会社も承認・差戻しを扱うので、見分けられるよう印を付ける */}
        {entry.property_inspection_id && (
          <span title="点検一覧からの申請。管理会社も承認・差戻しできます。差戻し（削除せず保守会社へ戻す）は点検一覧から行います">
            <Badge variant="primary" className="ml-1 px-1 py-0 text-[10px]">
              点検一覧
            </Badge>
          </span>
        )}
      </td>
      <td className={td}>
        <div className={NAME_CELL} title={propertyName || undefined}>
          {propertyName || '-'}
        </div>
      </td>
      <td className={td}>
        <div className={NAME_CELL} title={entry.inspection_type || undefined}>
          {entry.inspection_type}
        </div>
      </td>
      <td className={nowrap}>{formatJaDate(entry.inspection_start)}</td>
      <td className={nowrap}>{formatJaDate(entry.inspection_end)}</td>
      {/* 表示期間（掲出日）。終了が開始より前・すでに過ぎているものは承認前に気づけるよう赤くする */}
      <td
        className={periodWarning ? `${nowrap} font-medium text-red-600` : nowrap}
        title={periodWarning ?? undefined}
      >
        {formatJaDate(entry.display_start_date)}〜{formatJaDate(entry.display_end_date)}
        {/* 理由は2行目に短く出す（1行に並べると列が広がり、ほかの列が横スクロールに押し出される）。全文は title */}
        {periodWarning && <div className="text-xs">{periodWarningShort(periodWarning)}</div>}
      </td>
      <td className={td}>
        {entry.remarks ? (
          <div className={NAME_CELL} title={entry.remarks}>
            {entry.remarks}
          </div>
        ) : (
          '-'
        )}
      </td>
      <td className={td}>
        <div className={NAME_CELL} title={entry.vendor_name || undefined}>
          {entry.vendor_name || '-'}
        </div>
      </td>
      <td className={nowrap}>{formatJaDateTime(entry.created_at)}</td>
      <td className={td}>
        <div className={NAME_CELL} title={email}>
          {email}
        </div>
      </td>
      <td className={actions}>
        {/* ボタン（28px）は上下 2px をセルの余白に重ねて、行の高さを 33px に抑える */}
        <div className="-my-0.5 flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onViewDetail(entry)}>
            詳細
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>
            編集
          </Button>
          <Button size="sm" variant="success" onClick={() => onApprove(entry.id)}>
            承認
          </Button>
          <Button size="sm" variant="danger" onClick={() => onReject(entry.id)}>
            却下
          </Button>
        </div>
      </td>
    </tr>
  );
}
