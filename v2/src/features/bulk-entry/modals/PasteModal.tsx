import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { downloadCsv } from '@/lib/csv';
import { buildPasteTemplateCsv, PASTE_COLUMNS } from '../utils/parseExcelPaste';

interface PasteModalProps {
  open: boolean;
  onClose: () => void;
  /** 取り込む。空なら false を返してモーダルを開いたままにする */
  onImport: (text: string) => boolean;
}

const EXAMPLE = ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター...', '2025/1/15', '2025/1/15', '午前中'];

/**
 * Excel からの貼り付け（6列固定）。ヘッダー行は自動で飛ばす。
 * v1: bulk.html #pasteModal / js/bulk-modals.js openPasteModal / importFromPaste / downloadExcelTemplate
 */
export function PasteModal({ open, onClose, onImport }: PasteModalProps) {
  const [text, setText] = useState('');

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleImport = () => {
    if (onImport(text)) setText('');
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Excelからデータを取り込む"
      className="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleImport}>取り込む</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-600">
            Excelでコピーしたデータをそのまま貼り付けてください。
            <br />
            <small className="text-gray-500">ヘッダー行（「物件コード」等）がある場合は自動でスキップされます。</small>
          </p>
          <Button
            size="sm"
            variant="secondary"
            title="Excelテンプレートをダウンロード"
            onClick={() => downloadCsv(buildPasteTemplateCsv(), '一括入力テンプレート.csv')}
          >
            テンプレート
          </Button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここにExcelからコピーしたデータを貼り付け..."
          wrap="off"
          className="h-[45vh] min-h-40 w-full overflow-auto whitespace-pre rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />

        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-blue-700">列の順序・対応形式を確認</summary>
          <div className="mt-2 rounded-md bg-gray-50 p-3 text-xs">
            <p className="mb-2 font-medium">対応する列の順序:</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  {['A', 'B', 'C', 'D', 'E', 'F'].map((c) => (
                    <th key={c} className="border border-gray-300 p-1 text-left">
                      {c}列
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {PASTE_COLUMNS.map((c) => (
                    <td key={c} className="border border-gray-300 p-1">
                      {c}
                    </td>
                  ))}
                </tr>
                <tr className="text-gray-500">
                  {EXAMPLE.map((c, i) => (
                    <td key={i} className="border border-gray-300 p-1">
                      {c}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-gray-500">※ 端末ID（B列）は省略可能です。省略時は物件から自動設定されます。</p>
          </div>
        </details>
      </div>
    </Modal>
  );
}
