import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';
import { templateLabel, type BulkTemplate } from '../utils/bulkTemplates';
import { BulkStatsBar } from './BulkStatsBar';

interface BulkToolbarProps {
  /** 読み込みが済むまで操作させない（v1: js/bulk.js init は読み込み後にイベントを登録） */
  disabled?: boolean;
  templates: BulkTemplate[];
  onAddRow: () => void;
  onDuplicate: () => void;
  onDeleteSelected: () => void;
  onOpenPaste: () => void;
  onApplyTemplate: (id: string) => void;
  onOpenSaveTemplate: () => void;
  onOpenManageTemplate: () => void;
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`text-base font-bold ${className ?? 'text-gray-900'}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

/**
 * 行操作・データ入出力・表示の絞り込み・件数（1 行にまとめる）。
 * v1: bulk.html .bulk-toolbar / js/bulk-data.js updateStats / js/bulk-table.js updateSelectedCount
 */
export function BulkToolbar({
  disabled = false,
  templates,
  onAddRow,
  onDuplicate,
  onDeleteSelected,
  onOpenPaste,
  onApplyTemplate,
  onOpenSaveTemplate,
  onOpenManageTemplate,
}: BulkToolbarProps) {
  const rows = useBulkStore((s) => s.rows);
  const selectedCount = useBulkStore((s) => s.selectedIds.size);

  const total = rows.length;
  const valid = rows.filter((r) => r.isValid).length;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
      <div className="space-y-0.5">
        <div className="text-[11px] font-semibold text-gray-500">行操作</div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onAddRow} disabled={disabled} title="新しい行を追加 (Ctrl+Enter)">
            + 行を追加
          </Button>
          <Button size="sm" variant="secondary" onClick={onDuplicate} disabled={disabled} title="選択した行を複製 (Ctrl+D)">
            複製
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDeleteSelected}
            disabled={disabled || selectedCount === 0}
            title="選択した行を削除 (Delete)"
            className="text-red-600"
          >
            削除
          </Button>
        </div>
      </div>

      <div className="space-y-0.5">
        <div className="text-[11px] font-semibold text-gray-500">データ入出力</div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={onOpenPaste} disabled={disabled} title="Excelからデータを貼り付け">
            Excelから取込
          </Button>
          <div className="mx-1 h-6 w-px bg-gray-300" />
          <select
            aria-label="テンプレート"
            value=""
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onApplyTemplate(e.target.value);
            }}
            className="h-7 w-56 max-w-[16rem] truncate rounded-md border border-gray-300 px-2 py-0 text-sm"
          >
            <option value="">テンプレート</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id} title={templateLabel(t)}>
                {templateLabel(t)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenSaveTemplate}
            disabled={disabled}
            title="現在の設定をテンプレートとして保存"
          >
            テンプレ保存
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenManageTemplate}
            disabled={disabled}
            title="登録済みテンプレートの管理・削除"
          >
            管理
          </Button>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <BulkStatsBar />
        <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-1 shadow-sm">
          <Stat value={total} label="件" />
          <div className="h-5 w-px bg-gray-200" />
          <Stat value={valid} label="有効" className="text-green-600" />
          <Stat value={total - valid} label="エラー" className="text-red-600" />
          <Stat value={selectedCount} label="選択中" className="text-blue-600" />
        </div>
      </div>
    </div>
  );
}
