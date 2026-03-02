import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parseExcelPaste, DEFAULT_PASTE_COLUMNS } from '../utils/parseExcelPaste';
import { downloadCsv } from '@/lib/csv';

interface PasteModalProps {
  open: boolean;
  onClose: () => void;
  initialText?: string;
  onConfirm: (text: string) => number;
}

const FIELD_LABELS: Record<string, string> = {
  propertyCode: '物件コード',
  terminalId: '端末ID',
  vendorName: '保守会社名',
  inspectionType: '点検種別',
  startDate: '開始日',
  endDate: '終了日',
  displayStartDate: '表示開始日',
  displayEndDate: '表示終了日',
  remarks: '備考',
};

const TEMPLATE_COLUMNS = DEFAULT_PASTE_COLUMNS.map((f) => FIELD_LABELS[f] ?? f);

const COLUMN_HELP = `列順: ${TEMPLATE_COLUMNS.join(' / ')}

対応形式:
- Excel / Googleスプレッドシートからのコピー（タブ区切り）
- ヘッダー行がある場合は自動検出
- ヘッダーなしの場合は上記の列順で解釈
- 日付形式: YYYY-MM-DD または YYYY/MM/DD`;

export function PasteModal({ open, onClose, initialText = '', onConfirm }: PasteModalProps) {
  const [text, setText] = useState(initialText);
  const [showHelp, setShowHelp] = useState(false);
  const preview = text.trim() ? parseExcelPaste(text) : [];

  const handleConfirm = () => {
    if (!text.trim()) return;
    const count = onConfirm(text);
    if (count > 0) {
      setText('');
      onClose();
    }
  };

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleDownloadTemplate = () => {
    const header = TEMPLATE_COLUMNS.join(',');
    const sampleRow = 'P001,T001,サンプル保守,定期点検,2025-01-01,2025-01-31,2025-01-01,2025-01-31,';
    downloadCsv(`${header}\n${sampleRow}`, 'signage_bulk_template.csv');
  };

  return (
    <Modal open={open} onClose={handleClose} title="Excelデータ貼り付け" className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          ExcelやGoogleスプレッドシートからコピーしたデータを貼り付けてください。
          タブ区切りテキストとして解析されます。
        </p>

        {/* ヘルプ・テンプレート */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp((v) => !v)}
          >
            {showHelp ? '列順ヘルプを閉じる' : '列順ヘルプを表示'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownloadTemplate}>
            CSVテンプレートDL
          </Button>
        </div>

        {showHelp && (
          <pre className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
            {COLUMN_HELP}
          </pre>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここにExcelデータを貼り付けてください（Ctrl+V / Cmd+V）"
          className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />

        {preview.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">
              プレビュー: {preview.length}行検出
            </p>
            <div className="max-h-32 overflow-y-auto text-xs text-gray-600 space-y-1">
              {preview.slice(0, 5).map((row, i) => (
                <div key={i} className="truncate">
                  {i + 1}. {row.propertyCode || '-'} / {row.terminalId || '-'} /{' '}
                  {row.vendorName || '-'} / {row.inspectionType || '-'}
                </div>
              ))}
              {preview.length > 5 && (
                <div className="text-gray-400">...他 {preview.length - 5}行</div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleConfirm} disabled={preview.length === 0}>
            取り込み ({preview.length}行)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
