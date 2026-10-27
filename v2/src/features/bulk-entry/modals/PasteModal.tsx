import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { excelFileToTsv, PASTE_COLUMNS, PASTE_TEMPLATE_EXAMPLES } from '../utils/parseExcelPaste';

interface PasteModalProps {
  open: boolean;
  onClose: () => void;
  /** 取り込む。空なら false を返してモーダルを開いたままにする */
  onImport: (text: string) => boolean;
  /** 一括入力テンプレート（担当の物件を全部入れた xlsx）をダウンロードする（修正依頼1027 (2)） */
  onDownloadTemplate: () => Promise<void>;
}

const EXAMPLE = PASTE_TEMPLATE_EXAMPLES[0]!;
/** 列一覧の見出し（A〜E。列の数に合わせる） */
const COLUMN_LETTERS = PASTE_COLUMNS.map((_, i) => String.fromCharCode(65 + i));
/** 備考欄の書き方（見出し名は「備考」のまま） */
const REMARKS_HINT = '作業時間を記載下さい（例: 10:00～12:00 / No2号機11:00～12:00）';

/**
 * Excel からの貼り付け（5列。旧6列〔B列が端末ID〕も読む）。ヘッダー行は自動で飛ばす。
 * v1: bulk.html #pasteModal / js/bulk-modals.js openPasteModal / importFromPaste / downloadExcelTemplate
 */
export function PasteModal({ open, onClose, onImport, onDownloadTemplate }: PasteModalProps) {
  const [text, setText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleImport = () => {
    if (onImport(text)) setText('');
  };

  const handleDownloadTemplate = () => {
    setDownloading(true);
    onDownloadTemplate()
      .catch((err) => {
        console.error('Template download failed:', err);
        addToast('テンプレートをダウンロードできませんでした', 'error');
      })
      .finally(() => setDownloading(false));
  };

  // Excel ファイルを選ぶと、最初のシートを貼り付けと同じ形で欄に入れる（取り込む前に中身を見られる）
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setText(await excelFileToTsv(await file.arrayBuffer()));
    } catch (err) {
      console.error('Excel read failed:', err);
      addToast('Excelファイルを読み込めませんでした', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
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
            Excelでコピーしたデータをそのまま貼り付けるか、Excelファイルを選んでください。
            <br />
            <small className="text-gray-500">
              ヘッダー行（「物件コード」等）がある場合は自動でスキップされます。開始日・終了日・備考がどれも空の行は取り込みません。
            </small>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              title="担当の物件と点検種別を入れた一括入力テンプレート（Excel）をダウンロード"
              onClick={handleDownloadTemplate}
              disabled={downloading}
            >
              テンプレートDL
            </Button>
            <Button
              size="sm"
              variant="secondary"
              title="Excelファイル（一括入力テンプレートなど）の最初のシートを読み込む"
              onClick={() => fileRef.current?.click()}
            >
              Excelファイルを選ぶ
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              aria-label="Excelファイル"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>
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
                  {COLUMN_LETTERS.map((c) => (
                    <th key={c} className="border border-gray-300 p-1 text-left">
                      {c}列
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {PASTE_COLUMNS.map((c) => (
                    <td key={c} className="border border-gray-300 p-1 align-top">
                      {c}
                      {c === '備考' && <span className="block text-[11px] font-normal text-gray-500">{REMARKS_HINT}</span>}
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
          </div>
        </details>
      </div>
    </Modal>
  );
}
