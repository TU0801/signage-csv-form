import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';

interface BulkFooterProps {
  saving: boolean;
  onSave: () => void;
  onDownloadCsv: () => void;
  onCopyCsv: () => void;
}

/** 申請・CSV ダウンロード／コピー（有効な行が無いと押せない）。v1: bulk.html .bulk-footer / js/bulk-data.js updateButtons */
export function BulkFooter({ saving, onSave, onDownloadCsv, onCopyCsv }: BulkFooterProps) {
  const validCount = useBulkStore((s) => s.rows.filter((r) => r.isValid).length);
  const disabled = validCount === 0;

  return (
    <div className="flex items-center justify-between rounded-b-lg border-t border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <Button variant="success" size="lg" onClick={onSave} disabled={disabled || saving}>
          {saving ? '保存中...' : '↑ 申請する'}
        </Button>
        <span className="text-xs text-gray-500">管理者の承認後に反映されます</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onDownloadCsv}
          disabled={disabled}
          title="CSVファイルとしてダウンロード"
        >
          CSVダウンロード
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCopyCsv}
          disabled={disabled}
          title="CSV形式でクリップボードにコピー"
        >
          CSVコピー
        </Button>
      </div>
    </div>
  );
}
