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

const th = 'px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap';
const td = 'px-3 py-2';

/** 作成データの一覧（手元のデータ＋今月の申請済み） */
// v1: js/script.js renderDataList
export function EntryDataList({ entries, submitted, properties, onEdit, onRemove }: EntryDataListProps) {
  if (entries.length === 0 && submitted.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">データなし</div>;
  }

  const nameOf = (code: string) =>
    properties.find((p) => String(p.property_code) === String(code))?.property_name ?? '';

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
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
              <td className={td}>{e.propertyCode}</td>
              <td className={td}>{e.propertyName}</td>
              <td className={td}>{e.inspectionType}</td>
              <td className={td}>{e.startDate || '-'}</td>
              <td className={td}>{e.endDate || '-'}</td>
              <td className={td}>-</td>
              <td className={td}>
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
            return (
              <tr key={e.id} className="border-b border-gray-100 bg-slate-50 text-gray-600">
                <td className={td}>{e.property_code}</td>
                <td className={td}>{nameOf(e.property_code)}</td>
                <td className={td}>{e.inspection_type}</td>
                <td className={td}>{e.inspection_start || '-'}</td>
                <td className={td}>{e.inspection_end || '-'}</td>
                <td className={td}>{formatRegisteredAt(e.created_at)}</td>
                <td className={td}>
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
