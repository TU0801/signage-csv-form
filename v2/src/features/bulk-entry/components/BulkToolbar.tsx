import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';
import { templateLabel, type BulkTemplate } from '../utils/bulkTemplates';

interface BulkToolbarProps {
  /** 読み込みが済むまで操作させない（v1: js/bulk.js init は読み込み後にイベントを登録） */
  disabled?: boolean;
  /** 左端に出す部品（1件入力・一括入力の切替） */
  leading?: ReactNode;
  /** 表示の絞り込み（時期・物件の検索） */
  filters?: ReactNode;
  templates: BulkTemplate[];
  onAddRow: () => void;
  onDuplicate: () => void;
  onDeleteSelected: () => void;
  /** 選択行に同じ点検種別・日付・表示設定をまとめて入れる */
  onOpenBulkApply: () => void;
  onOpenPaste: () => void;
  /** 報告書一括アップロード（保守会社・管理者。出さないときは undefined） */
  onOpenBulkReport?: () => void;
  /** その他ファイルアップロード（見積書・請求書など。修正依頼1025 G2。出さないときは undefined） */
  onOpenOtherFile?: () => void;
  /** 建物追加の申請 */
  onOpenBuildingRequest?: () => void;
  onApplyTemplate: (id: string) => void;
  onOpenSaveTemplate: () => void;
  onOpenManageTemplate: () => void;
}

/**
 * 行操作・データ入出力・報告書・建物追加・表示の絞り込み（左）と、テンプレート（右端に小さく。修正依頼1024 B6）。
 * 表示フィルター（すべて/有効のみ/エラーのみ）と件数は B7 で外した（エラーは申請時に知らせて該当の欄へ移る）。
 * v1: bulk.html .bulk-toolbar
 */
export function BulkToolbar({
  disabled = false,
  leading,
  filters,
  templates,
  onAddRow,
  onDuplicate,
  onDeleteSelected,
  onOpenBulkApply,
  onOpenPaste,
  onOpenBulkReport,
  onOpenOtherFile,
  onOpenBuildingRequest,
  onApplyTemplate,
  onOpenSaveTemplate,
  onOpenManageTemplate,
}: BulkToolbarProps) {
  const selectedCount = useBulkStore((s) => s.selectedIds.size);

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
      {leading}
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
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenBulkApply}
            disabled={disabled || selectedCount === 0}
            title="選択した行に点検種別・点検日・表示期間などをまとめて入れる"
          >
            選択行に一括設定
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenPaste} disabled={disabled} title="Excelからデータを貼り付け">
            Excelから取込
          </Button>
          {onOpenBulkReport && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenBulkReport}
              disabled={disabled}
              title="複数の点検をまとめた1つのPDFを切り分けて報告書として登録する"
              className="border-blue-300 text-blue-700"
            >
              報告書一括アップロード
            </Button>
          )}
          {onOpenOtherFile && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenOtherFile}
              disabled={disabled}
              title="見積書・請求書・契約書・建物関連情報・提案書・写真などを建物ごとに登録する"
              className="border-blue-300 text-blue-700"
            >
              その他ファイルアップロード
            </Button>
          )}
          {onOpenBuildingRequest && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenBuildingRequest}
              disabled={disabled}
              title="担当する建物が一覧に無いときに追加を申請する"
              className="border-green-300 text-green-700"
            >
              建物追加 申請
            </Button>
          )}
        </div>
      </div>

      {filters && (
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold text-gray-500">表示</div>
          <div className="flex items-center gap-1.5">{filters}</div>
        </div>
      )}

      {/* テンプレートはあまり使わないので小さく右端へ（B6） */}
      <div className="ml-auto flex items-center gap-1" aria-label="テンプレート">
        <select
          aria-label="テンプレート"
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) onApplyTemplate(e.target.value);
          }}
          className="h-6 w-36 max-w-[10rem] truncate rounded border border-gray-300 px-1 py-0 text-xs text-gray-600"
        >
          <option value="">テンプレート</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id} title={templateLabel(t)}>
              {templateLabel(t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenSaveTemplate}
          disabled={disabled}
          title="現在の設定をテンプレートとして保存"
          className="h-6 rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          テンプレ保存
        </button>
        <button
          type="button"
          onClick={onOpenManageTemplate}
          disabled={disabled}
          title="登録済みテンプレートの管理・削除"
          className="h-6 rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          管理
        </button>
      </div>
    </div>
  );
}
