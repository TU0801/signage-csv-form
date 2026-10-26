import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';
import { isApplyTarget } from '../utils/scheduleRows';

interface BulkFooterProps {
  saving: boolean;
  onSave: () => void;
  onDownloadCsv: () => void;
  onCopyCsv: () => void;
  /** 申請できない理由（管理者が保守会社を選んでいないなど）。あれば申請だけ押せなくして横に出す（CSV は使える） */
  saveBlockedReason?: string;
}

/** 申請・CSV ダウンロード／コピー（申請の対象の行が無いと押せない）。v1: bulk.html .bulk-footer / js/bulk-data.js updateButtons */
export function BulkFooter({ saving, onSave, onDownloadCsv, onCopyCsv, saveBlockedReason }: BulkFooterProps) {
  // 申請の対象（手で足した行と、点検開始日を入れた未申請の予定の行）が無いと押せない。エラーの行は押したときに知らせる（B7）
  const targetCount = useBulkStore((s) => s.rows.filter(isApplyTarget).length);
  const disabled = targetCount === 0;

  return (
    <div className="flex items-center justify-between rounded-b-lg border-t border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-3">
        <Button variant="success" size="lg" onClick={onSave} disabled={disabled || saving || !!saveBlockedReason}>
          {saving ? '保存中...' : '↑ 申請する'}
        </Button>
        <div className="text-xs leading-tight text-gray-500">
          <p>管理者の承認後に反映されます</p>
          {/* ブラウザの拡大率はサイトから変えられないので、戻し方を案内する（修正依頼1026 I2） */}
          <p data-testid="zoom-help">画面が大きい／小さいときは Ctrl+0（Mac は ⌘+0）で100%に戻せます</p>
        </div>
        {saveBlockedReason && <span className="text-xs font-medium text-red-600">{saveBlockedReason}</span>}
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
