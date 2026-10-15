import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import { createBulkEntries } from '@/lib/api/bulk-entry';
import { useBulkStore, cancelBulkAutoSave, type BulkRowsPatch } from '@/stores/bulkStore';
import { useBulkConfirm } from '@/features/bulk-entry/hooks/useBulkConfirm';
import { useBulkSession } from '@/features/bulk-entry/hooks/useBulkSession';
import { BulkToolbar } from '@/features/bulk-entry/components/BulkToolbar';
import { BulkTable } from '@/features/bulk-entry/components/BulkTable';
import { BulkFooter } from '@/features/bulk-entry/components/BulkFooter';
import { PasteModal } from '@/features/bulk-entry/modals/PasteModal';
import { RowDetailModal } from '@/features/bulk-entry/modals/RowDetailModal';
import { SaveTemplateModal } from '@/features/bulk-entry/modals/SaveTemplateModal';
import { ManageTemplateModal } from '@/features/bulk-entry/modals/ManageTemplateModal';
import { BulkApplyModal } from '@/features/bulk-entry/modals/BulkApplyModal';
import { parseExcelPaste } from '@/features/bulk-entry/utils/parseExcelPaste';
import { bulkCsvFilename, generateBulkCsv } from '@/features/bulk-entry/utils/bulkCsv';
import { buildBulkEntries } from '@/features/bulk-entry/utils/buildBulkEntries';
import { matchesBulkFilter } from '@/features/bulk-entry/utils/rowFilter';
import { clearAutoSave } from '@/features/bulk-entry/utils/bulkAutoSave';
import { getStoredTemplates, getVisibleTemplates, templateRows } from '@/features/bulk-entry/utils/bulkTemplates';
import { compareVendorNames } from '@/lib/vendorOptions';

/** v1 の申請失敗メッセージ（message と details をそのまま付ける）。v1: js/bulk-data.js saveAll catch */
function saveErrorMessage(error: unknown): string {
  let msg = '申請に失敗しました';
  const e = error as { message?: string; details?: string } | null;
  if (e?.message) msg += ': ' + e.message;
  if (e?.details) msg += ' (' + e.details + ')';
  return msg;
}

/** トーストに並べる名前の上限（多いときは「ほかN件」にまとめる） */
const MAX_LISTED_NAMES = 5;

function listNames(names: string[]): string {
  const shown = names.slice(0, MAX_LISTED_NAMES).join('、');
  return names.length > MAX_LISTED_NAMES ? `${shown} ほか${names.length - MAX_LISTED_NAMES}件` : shown;
}

/**
 * 一括入力画面。
 * v1: bulk.html / js/bulk.js
 */
export function BulkEntryPage() {
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useBulkConfirm();
  const { ready, isAdmin, vendors, changeVendor, loadFailed, reload } = useBulkSession(confirm);

  const rows = useBulkStore((s) => s.rows);
  const currentVendor = useBulkStore((s) => s.currentVendor);
  const addRow = useBulkStore((s) => s.addRow);
  const addRowWithCopy = useBulkStore((s) => s.addRowWithCopy);
  const duplicateRows = useBulkStore((s) => s.duplicateRows);
  const removeRows = useBulkStore((s) => s.removeRows);
  const replaceRows = useBulkStore((s) => s.replaceRows);
  const clearRows = useBulkStore((s) => s.clearRows);
  const applyToRows = useBulkStore((s) => s.applyToRows);
  const selectedCount = useBulkStore((s) => s.selectedIds.size);
  // 一括設定は今の絞り込みで見えている選択行だけに入れる（隠れた行を黙って上書きしない）
  const visibleSelectedCount = useBulkStore(
    (s) => s.rows.filter((r) => s.selectedIds.has(r.id) && matchesBulkFilter(r, s.filter)).length,
  );

  // 管理者が保守会社を選ばないと保守会社名が空で登録できない（DB で弾かれる）ので、申請の前に止めて案内する
  const saveBlockedReason = isAdmin && !currentVendor.id ? 'ヘッダーで保守会社を選んでください' : undefined;

  const [showPaste, setShowPaste] = useState(false);
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [detailRowId, setDetailRowId] = useState<number | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showManageTemplate, setShowManageTemplate] = useState(false);
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  // 選択中の保守会社のテンプレート＋全社共通。v1: js/bulk-modals.js loadTemplates
  const templates = useMemo(() => {
    void templatesVersion;
    return getVisibleTemplates(currentVendor.id);
  }, [currentVendor.id, templatesVersion]);
  const refreshTemplates = useCallback(() => setTemplatesVersion((v) => v + 1), []);

  // v1: js/bulk-table.js duplicateSelectedRows（並びは duplicateRows が表の順に揃える）
  const handleDuplicate = useCallback(() => {
    const ids = [...useBulkStore.getState().selectedIds];
    if (ids.length === 0) {
      addToast('複製する行を選択してください', 'error');
      return;
    }
    duplicateRows(ids);
    addToast(`${ids.length}件の行を複製しました`, 'success');
  }, [duplicateRows, addToast]);

  // v1: js/bulk-table.js deleteSelectedRows
  const handleDeleteSelected = useCallback(async () => {
    const ids = [...useBulkStore.getState().selectedIds];
    if (ids.length === 0) {
      addToast('削除する行を選択してください', 'error');
      return;
    }
    if (!(await confirm(`${ids.length}件の行を削除しますか？`))) return;
    removeRows(ids);
    addToast(`${ids.length}件の行を削除しました`, 'success');
  }, [removeRows, addToast, confirm]);

  // v1: js/bulk-modals.js importFromPaste
  const handleImport = (raw: string): boolean => {
    if (!raw.trim()) {
      addToast('データを入力してください', 'error');
      return false;
    }
    const { rows: parsed, unresolvedCount, unresolvedNames, errorCount } = parseExcelPaste(
      raw,
      useBulkStore.getState().masterData.properties,
    );
    parsed.forEach((r) => addRow(r));
    setShowPaste(false);
    if (parsed.length > 0) addToast(`${parsed.length}件のデータを取り込みました`, 'success');
    if (unresolvedCount > 0) {
      // どの名前が合わなかったかを並べる（行の物件セルにも「未一致: ○○」と出る）
      addToast(
        `${unresolvedCount}件は物件名が見つかりませんでした。行を確認してください\n見つからなかった名前: ${listNames(unresolvedNames)}`,
        'error',
      );
    }
    if (errorCount > 0) addToast(`${errorCount}件の不正な行をスキップしました`, 'error');
    return true;
  };

  // v1: js/bulk-modals.js applyTemplate
  const handleApplyTemplate = async (id: string) => {
    const template = getStoredTemplates().find((t) => t.id === id);
    if (!template) return;
    if (useBulkStore.getState().rows.length > 0 && !(await confirm('現在のデータを置き換えますか？'))) return;
    replaceRows(templateRows(template));
    addToast(`テンプレート「${template.name}」を適用しました`, 'success');
  };

  // 選択行への一括設定（入れた項目だけ上書き）
  const handleBulkApply = (patch: BulkRowsPatch) => {
    const { rows: all, selectedIds, filter } = useBulkStore.getState();
    const ids = all.filter((r) => selectedIds.has(r.id) && matchesBulkFilter(r, filter)).map((r) => r.id);
    applyToRows(ids, patch);
    setShowBulkApply(false);
    addToast(`${ids.length}件の行に設定しました`, 'success');
  };

  // 申請するのは有効な行だけ（v1 と同じ）。エラーの行は v1 では申請後に黙って消えていたので、
  // 先に件数を確認し、申請後も表に残す。v1: js/bulk-data.js saveAll
  const handleSave = async () => {
    const { rows: current, masterData, currentVendor: vendor, appSettings, userId } = useBulkStore.getState();
    const validRows = current.filter((r) => r.isValid);
    const validCount = validRows.length;
    const errorCount = current.length - validCount;
    if (validCount === 0) {
      addToast('保存できる有効なデータがありません', 'error');
      return;
    }
    if (saveBlockedReason) {
      addToast(saveBlockedReason, 'error');
      return;
    }
    if (
      errorCount > 0 &&
      !(await confirm(`有効な${validCount}件を申請します。\nエラーの${errorCount}件は申請せず、表に残します。`))
    ) {
      return;
    }
    setSaving(true);
    try {
      await createBulkEntries(buildBulkEntries(current, masterData, vendor, appSettings), userId ?? '');
      cancelBulkAutoSave();
      clearAutoSave(userId);
      // 申請した行だけ消す（申請中に足した行・エラーの行は残り、removeRows が残りの行で自動保存を書き直す）
      const submitted = new Set(validRows.map((r) => r.id));
      const remaining = useBulkStore.getState().rows.filter((r) => !submitted.has(r.id)).length;
      addToast(
        remaining > 0
          ? `${validCount}件のデータを申請しました\n残りの${remaining}件は表に残しています`
          : `${validCount}件のデータを申請しました`,
        'success',
      );
      if (remaining > 0) removeRows([...submitted]);
      else clearRows();
    } catch (error) {
      console.error('Save failed:', error);
      addToast(saveErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  // v1: js/bulk-data.js downloadCSV
  const handleDownloadCsv = () => {
    const { rows: current, masterData, currentVendor: vendor, appSettings } = useBulkStore.getState();
    const csv = generateBulkCsv(current, masterData, vendor, appSettings);
    if (!csv) {
      addToast('ダウンロードするデータがありません', 'error');
      return;
    }
    downloadCsv(csv, bulkCsvFilename());
    addToast('CSVをダウンロードしました', 'success');
  };

  // v1: js/bulk-data.js copyCSV（BOM なし）
  const handleCopyCsv = async () => {
    const { rows: current, masterData, currentVendor: vendor, appSettings } = useBulkStore.getState();
    const csv = generateBulkCsv(current, masterData, vendor, appSettings);
    if (!csv) {
      addToast('コピーするデータがありません', 'error');
      return;
    }
    try {
      await copyCsvToClipboard(csv);
      addToast('CSVをクリップボードにコピーしました', 'success');
    } catch (error) {
      console.error('Clipboard write failed:', error);
      addToast('コピーに失敗しました', 'error');
    }
  };

  // キーボードショートカット。v1: js/bulk.js handleGlobalKeyDown（Escape はモーダル・メニューが自分で閉じる）
  // 読み込みが済むまでは登録しない（v1: js/bulk.js init は読み込み後に setupEventListeners）
  useEffect(() => {
    if (!ready) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        addRowWithCopy();
      }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
      const target = e.target as HTMLElement | null;
      if (e.key === 'Delete' && !target?.matches('input, textarea, select')) {
        e.preventDefault();
        void handleDeleteSelected();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ready, addRowWithCopy, handleDuplicate, handleDeleteSelected]);

  return (
    // tall（幅 1024 以上・高さ 760 以上）のときだけ画面の高さに合わせ、表の部分だけをスクロールさせる。
    // main の上下の余白（py-3 = 1.5rem）を引く。h1 はヘッダーのナビ「一括入力」と重複するので sr-only
    <div className="flex flex-col gap-2 tall:h-[calc(100dvh-var(--header-h)-1.5rem)]">
      <h1 className="sr-only">一括入力</h1>
      {/* 管理者の保守会社選択はヘッダーに出す（v1.31.1。v1: bulk.html header #adminVendorSelectGroup） */}
      {isAdmin && (
        <HeaderSlot>
          <div className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-amber-400 bg-amber-50 px-2 py-1">
            <span className="whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-800">
              管理者
            </span>
            <select
              aria-label="保守会社を選択"
              value={currentVendor.id ?? ''}
              onChange={(e) => void changeVendor(e.target.value)}
              className="max-w-[20rem] rounded border border-amber-400 bg-white px-1.5 py-1 text-sm text-slate-800"
            >
              <option value="">-- 保守会社を選択 --</option>
              {[...vendors].sort((a, b) => compareVendorNames(a.vendorName, b.vendorName)).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendorName}
                </option>
              ))}
            </select>
          </div>
        </HeaderSlot>
      )}

      <Card className="flex flex-col overflow-hidden tall:min-h-0 tall:flex-1">
        <BulkToolbar
          disabled={!ready}
          templates={templates}
          onAddRow={addRowWithCopy}
          onDuplicate={handleDuplicate}
          onDeleteSelected={() => void handleDeleteSelected()}
          onOpenBulkApply={() => setShowBulkApply(true)}
          onOpenPaste={() => setShowPaste(true)}
          onApplyTemplate={(id) => void handleApplyTemplate(id)}
          onOpenSaveTemplate={() => setShowSaveTemplate(true)}
          onOpenManageTemplate={() => setShowManageTemplate(true)}
        />

        {/* 行が増えても申請ボタンが画面外に出ないよう、表の部分だけスクロールさせる（v1.30.1）。
            12.5rem は main の上下の余白・ツールバー（狭い幅で 2 行に折り返したとき）・申請の行のぶん。
            tall のときは Card の残りの高さをすべて使う（max-h と min-h は外す） */}
        <div
          className="max-h-[calc(100dvh-var(--header-h)-12.5rem)] min-h-[12rem] overflow-auto tall:max-h-none tall:min-h-0 tall:flex-1"
          data-testid="bulk-table-container"
        >
          {rows.length === 0 && !ready ? (
            // 読み込み中・失敗を「データがありません」と区別する（失敗したらその場で読み直せるようにする）
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              {loadFailed ? (
                <>
                  <h3 className="font-semibold text-red-700">マスターデータを読み込めませんでした</h3>
                  <p className="text-sm text-gray-500">通信状態を確認して、もう一度読み込んでください</p>
                  <Button onClick={reload}>再読み込み</Button>
                </>
              ) : (
                <>
                  <Spinner />
                  <p className="text-sm text-gray-500">マスターデータを読み込み中…</p>
                </>
              )}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <h3 className="font-semibold text-gray-700">データがありません</h3>
              <p className="text-sm text-gray-500">「行を追加」または「Excelから取込」で入力を開始してください</p>
              <Button onClick={addRowWithCopy} disabled={!ready}>
                行を追加して始める
              </Button>
            </div>
          ) : (
            <BulkTable onOpenRowDetail={setDetailRowId} confirm={confirm} />
          )}
        </div>

        <BulkFooter
          saving={saving}
          onSave={() => void handleSave()}
          onDownloadCsv={handleDownloadCsv}
          onCopyCsv={() => void handleCopyCsv()}
          saveBlockedReason={saveBlockedReason}
        />
      </Card>

      <BulkApplyModal
        open={showBulkApply}
        onClose={() => setShowBulkApply(false)}
        onApply={handleBulkApply}
        selectedCount={visibleSelectedCount}
        hiddenSelectedCount={selectedCount - visibleSelectedCount}
      />
      <PasteModal open={showPaste} onClose={() => setShowPaste(false)} onImport={handleImport} />
      <RowDetailModal open={detailRowId !== null} onClose={() => setDetailRowId(null)} rowId={detailRowId} />
      <SaveTemplateModal
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        onSaved={refreshTemplates}
      />
      <ManageTemplateModal
        open={showManageTemplate}
        onClose={() => setShowManageTemplate(false)}
        templates={templates}
        onChanged={refreshTemplates}
        confirm={confirm}
      />
      {confirmDialog}
    </div>
  );
}
