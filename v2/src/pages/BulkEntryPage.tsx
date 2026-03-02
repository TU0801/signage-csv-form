import { useState, useCallback, useEffect, useRef } from 'react';
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
import { AdminVendorFilter, useAdminVendorFilter } from '@/components/AdminVendorFilter';
import { useBulkStore } from '@/stores/bulkStore';
import { useMasterData } from '@/hooks/useMasterData';
import { parseExcelPaste } from '@/features/bulk-entry/utils/parseExcelPaste';

export function BulkEntryPage() {
  const { addToast } = useToast();
  const { vendors } = useMasterData();
  const adminFilter = useAdminVendorFilter();
  const rows = useBulkStore((s) => s.rows);
  const addRow = useBulkStore((s) => s.addRow);
  const duplicateRows = useBulkStore((s) => s.duplicateRows);
  const removeRows = useBulkStore((s) => s.removeRows);
  const selectedIds = useBulkStore((s) => s.selectedIds);
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

  // キーボードショートカット（selectedIds をrefで参照してリスナー再登録を抑制）
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Ctrl+Enter: 行追加
      if (isCtrl && e.key === 'Enter') {
        e.preventDefault();
        addRow();
        addToast('行を追加しました', 'info');
        return;
      }

      // Ctrl+D: 選択行を複製
      if (isCtrl && e.key === 'd') {
        e.preventDefault();
        const ids = [...selectedIdsRef.current];
        if (ids.length > 0) {
          duplicateRows(ids);
          addToast(`${ids.length}行を複製しました`, 'info');
        }
        return;
      }

      // Delete: 選択行を削除（入力フィールド内は除外）
      if (e.key === 'Delete' && !isInput) {
        const ids = [...selectedIdsRef.current];
        if (ids.length > 0) {
          removeRows(ids);
          addToast(`${ids.length}行を削除しました`, 'info');
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addRow, duplicateRows, removeRows, addToast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">一括入力</h1>
          <p className="mt-1 text-sm text-gray-500">
            複数のエントリーを一括で入力・編集できます
            <span className="ml-2 text-gray-400">
              (Ctrl+Enter: 行追加 / Ctrl+D: 複製 / Delete: 削除)
            </span>
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

      <AdminVendorFilter
        vendors={vendors}
        onVendorFilter={adminFilter.setSelectedVendorId}
      />

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
