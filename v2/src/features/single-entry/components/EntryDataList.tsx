import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { MasterProperty } from '@/types/app';
import type { DbEntry } from '@/types/database';
import type { LocalEntry } from '../types';
import { formatRegisteredAt, submittedStatusLabel } from '../lib/entryLogic';

interface EntryDataListProps {
  /** 申請前の手元のデータ（編集・削除できる） */
  entries: LocalEntry[];
  /** 今月自分が登録したデータ（DB） */
  submitted: DbEntry[];
  /** 建物名を引くための物件（全物件。担当から外れた物件は空欄になる） */
  properties: MasterProperty[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

// 見出しは一覧の箱（縦スクロール）の上端に貼り付ける。背景は不透明にし、下線は tr の border が一緒に動かないので影で引く
const th = 'cell-head sticky top-0 z-10 bg-gray-50 text-left font-medium text-gray-700 shadow-[inset_0_-1px_0_var(--color-gray-200)]';
const tdNowrap = 'cell whitespace-nowrap';
// 長い名前は1行で切り、全文は title で見せる（表のセルには max-width が効かないので、内側のブロックで切る）
const nameBox = 'block max-w-[16rem] truncate';
// 操作ボタンのある列は上下の余白を詰めて行の高さを抑える（cell と p* を同じ要素に並べない）
const tdAction = 'whitespace-nowrap px-2 py-0.5';

/** 作成データの一覧（手元のデータ＋今月の申請済み） */
// v1: js/script.js renderDataList
export function EntryDataList({ entries, submitted, properties, onEdit, onRemove }: EntryDataListProps) {
  if (entries.length === 0 && submitted.length === 0) {
    return <div className="py-6 text-center text-sm text-gray-400">データなし</div>;
  }

  const nameOf = (code: string) =>
    properties.find((p) => String(p.property_code) === String(code))?.property_name ?? '';

  return (
    <div className="overflow-auto tall:h-full">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={th}>物件コード</th>
            <th className={th}>建物名</th>
            <th className={th}>点検種別</th>
            <th className={th}>開始日</th>
            <th className={th}>終了日</th>
            <th className={th}>登録日</th>
            <th className={th}>ステータス</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e._id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className={tdNowrap}>{e.propertyCode}</td>
              <td className="cell">
                <span className={nameBox} title={e.propertyName}>
                  {e.propertyName}
                </span>
              </td>
              <td className="cell">
                <span className={nameBox} title={e.inspectionType}>
                  {e.inspectionType}
                </span>
              </td>
              <td className={tdNowrap}>{e.startDate || '-'}</td>
              <td className={tdNowrap}>{e.endDate || '-'}</td>
              <td className={tdNowrap}>-</td>
              <td className={tdAction}>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => onEdit(e._id)}>
                    編集
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onRemove(e._id)}>
                    削除
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {submitted.map((e) => {
            const status = submittedStatusLabel(e.status);
            const name = nameOf(e.property_code);
            return (
              <tr key={e.id} className="border-b border-gray-100 bg-slate-50 text-gray-600">
                <td className={tdNowrap}>{e.property_code}</td>
                <td className="cell">
                  <span className={nameBox} title={name}>
                    {name}
                  </span>
                </td>
                <td className="cell">
                  <span className={nameBox} title={e.inspection_type}>
                    {e.inspection_type}
                  </span>
                </td>
                <td className={tdNowrap}>{e.inspection_start || '-'}</td>
                <td className={tdNowrap}>{e.inspection_end || '-'}</td>
                <td className={tdNowrap}>{formatRegisteredAt(e.created_at)}</td>
                <td className={tdNowrap}>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
