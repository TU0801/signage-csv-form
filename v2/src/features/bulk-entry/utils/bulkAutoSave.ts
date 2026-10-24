import type { BulkEntryRow, BulkRowInput } from '../types';

/** 未保存の行を残す期間 */
export const AUTO_SAVE_TTL_MS = 24 * 60 * 60 * 1000;
/** 最後の変更から保存するまでの待ち時間 */
export const AUTO_SAVE_DELAY_MS = 1000;

/** v1 と同じキー（ユーザーごと）。v1: js/bulk-data.js getAutoSaveKey */
export function autoSaveKey(userId: string | null): string {
  return `bulk_autosave_${userId}`;
}

export interface AutoSaveData {
  timestamp: number;
  rowIdCounter: number;
  rows: BulkRowInput[];
}

/**
 * 行を保存する（0行ならキーを消す）。書き込み失敗は警告だけ。
 * v1: js/bulk-data.js saveAutoSave
 */
export function writeAutoSave(userId: string | null, allRows: BulkEntryRow[], rowIdCounter: number): void {
  // 点検予定の行は開くたびに DB から作り直すので保存しない（修正依頼1024）
  const rows = allRows.filter((r) => !r.schedule);
  try {
    if (rows.length === 0) {
      localStorage.removeItem(autoSaveKey(userId));
      return;
    }
    const data: AutoSaveData = {
      timestamp: Date.now(),
      rowIdCounter,
      rows: rows.map((r) => ({
        propertyCode: r.propertyCode,
        terminalId: r.terminalId,
        vendorName: r.vendorName,
        inspectionType: r.inspectionType,
        startDate: r.startDate,
        endDate: r.endDate,
        remarks: r.remarks,
        memo: r.memo,
        displayTime: r.displayTime,
        noticeText: r.noticeText,
        displayStartDate: r.displayStartDate,
        displayStartTime: r.displayStartTime,
        displayEndDate: r.displayEndDate,
        displayEndTime: r.displayEndTime,
        showOnBoard: r.showOnBoard,
        emergencyContact: r.emergencyContact,
        posterType: r.posterType,
        posterImage: r.posterImage,
        position: r.position,
      })),
    };
    localStorage.setItem(autoSaveKey(userId), JSON.stringify(data));
  } catch (e) {
    console.warn('Auto-save failed (localStorage may be full or disabled):', e);
  }
}

export function clearAutoSave(userId: string | null): void {
  try {
    localStorage.removeItem(autoSaveKey(userId));
  } catch {
    // 読み書きできない環境では何もしない
  }
}

/**
 * 復元できる保存データ。無い・空・壊れている・24時間を過ぎた（このときはキーも消す）なら null。
 * v1: js/bulk-data.js restoreAutoSave（確認ダイアログより前の部分）
 */
export function readAutoSave(userId: string | null): AutoSaveData | null {
  try {
    const data = localStorage.getItem(autoSaveKey(userId));
    if (!data) return null;
    const saved = JSON.parse(data) as Partial<AutoSaveData>;
    if (!saved.rows || saved.rows.length === 0) return null;
    if (Date.now() - (saved.timestamp ?? 0) > AUTO_SAVE_TTL_MS) {
      localStorage.removeItem(autoSaveKey(userId));
      return null;
    }
    return { timestamp: saved.timestamp ?? 0, rowIdCounter: saved.rowIdCounter || 0, rows: saved.rows };
  } catch (e) {
    console.error('Auto-save restore failed:', e);
    return null;
  }
}
