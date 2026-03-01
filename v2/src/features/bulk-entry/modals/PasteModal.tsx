import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parseExcelPaste } from '../utils/parseExcelPaste';

interface PasteModalProps {
  open: boolean;
  onClose: () => void;
  initialText?: string;
  onConfirm: (text: string) => number;
}

export function PasteModal({ open, onClose, initialText = '', onConfirm }: PasteModalProps) {
  const [text, setText] = useState(initialText);
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

  return (
    <Modal open={open} onClose={handleClose} title="Excelデータ貼り付け" className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          ExcelやGoogleスプレッドシートからコピーしたデータを貼り付けてください。
          タブ区切りテキストとして解析されます。
        </p>
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
