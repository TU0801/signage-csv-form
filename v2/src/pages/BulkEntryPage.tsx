import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBulkAutoSave } from '@/features/bulk-entry/hooks/useBulkAutoSave';
import { useBulkPaste } from '@/features/bulk-entry/hooks/useBulkPaste';
import { BulkToolbar } from '@/features/bulk-entry/components/BulkToolbar';
import { BulkStatsBar } from '@/features/bulk-entry/components/BulkStatsBar';
import { BulkTable } from '@/features/bulk-entry/components/BulkTable';
import { BulkFooter } from '@/features/bulk-entry/components/BulkFooter';
import { PasteModal } from '@/features/bulk-entry/modals/PasteModal';
import { BulkEditModal } from '@/features/bulk-entry/modals/BulkEditModal';
import { RowDetailModal } from '@/features/bulk-entry/modals/RowDetailModal';
import { SaveTemplateModal } from '@/features/bulk-entry/modals/SaveTemplateModal';
import { useBulkStore } from '@/stores/bulkStore';
import { parseExcelPaste } from '@/features/bulk-entry/utils/parseExcelPaste';

export function BulkEntryPage() {
  const { addToast } = useToast();
  const rows = useBulkStore((s) => s.rows);
  const saveToStorage = useBulkStore((s) => s.saveToStorage);
  const importRows = useBulkStore((s) => s.importRows);

  // Auto-save hook
  useBulkAutoSave();

  // Paste detection
  const { showPasteModal, pasteText, confirmPaste, cancelPaste } = useBulkPaste();

  // Modal states
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showRowDetail, setShowRowDetail] = useState(false);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);

  const handleOpenRowDetail = useCallback((rowId: string) => {
    setDetailRowId(rowId);
    setShowRowDetail(true);
  }, []);

  const handleConfirmAutoDetectedPaste = useCallback(
    (text: string) => {
      const count = confirmPaste(text);
      if (count > 0) {
        addToast(`${count}行を取り込みました`, 'success');
      }
      return count;
    },
    [confirmPaste, addToast],
  );

  const handleManualPasteConfirm = useCallback(
    (text: string) => {
      const parsed = parseExcelPaste(text);
      if (parsed.length > 0) {
        importRows(parsed);
        addToast(`${parsed.length}行を取り込みました`, 'success');
      }
      return parsed.length;
    },
    [importRows, addToast],
  );

  const handleSave = useCallback(() => {
    saveToStorage();
    addToast('保存しました', 'success');
  }, [saveToStorage, addToast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">一括入力</h1>
          <p className="mt-1 text-sm text-gray-500">
            複数のエントリーを一括で入力・編集できます
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowTemplate(true)}>
            テンプレート
          </Button>
          <Button size="sm" variant="secondary" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>

      {/* Main card */}
      <Card>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <BulkToolbar
            onOpenPaste={() => setShowManualPaste(true)}
            onOpenBulkEdit={() => setShowBulkEdit(true)}
          />

          {/* Stats bar */}
          {rows.length > 0 && <BulkStatsBar />}

          {/* Table */}
          <BulkTable onOpenRowDetail={handleOpenRowDetail} />
        </CardContent>

        {/* Footer */}
        {rows.length > 0 && <BulkFooter />}
      </Card>

      {/* Auto-detected paste modal */}
      <PasteModal
        open={showPasteModal}
        onClose={cancelPaste}
        initialText={pasteText}
        onConfirm={handleConfirmAutoDetectedPaste}
      />

      {/* Manual paste modal */}
      <PasteModal
        open={showManualPaste}
        onClose={() => setShowManualPaste(false)}
        onConfirm={handleManualPasteConfirm}
      />

      {/* Bulk edit modal */}
      <BulkEditModal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} />

      {/* Row detail modal */}
      <RowDetailModal
        open={showRowDetail}
        onClose={() => {
          setShowRowDetail(false);
          setDetailRowId(null);
        }}
        rowId={detailRowId}
      />

      {/* Template modal */}
      <SaveTemplateModal open={showTemplate} onClose={() => setShowTemplate(false)} />
    </div>
  );
}
