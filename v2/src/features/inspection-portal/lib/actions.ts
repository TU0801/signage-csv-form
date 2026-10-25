import type { PortalEntryRow } from '@/types/portal';
import { focusEntry, type ScheduleItem } from './schedule';

/*
 * 点検一覧の行に出す操作（ロール別）。
 * 保守会社・管理者: 申請（未申請・差戻し）と報告書。管理会社・管理者: 承認（申請済み）と差戻し（申請済み・承認済み。取込済みは不可）。
 * 管理会社には申請・報告書の提出を出さない（DB も管理会社の申請作成を受け付けない）。
 */

export interface PortalRole {
  isAdmin: boolean;
  isManagement: boolean;
}

/** 申請・報告書の提出ができるか（保守会社と管理者） */
export function canSubmit(role: PortalRole): boolean {
  return role.isAdmin || !role.isManagement;
}

/** 承認・差戻しができるか（管理会社と管理者） */
export function canReview(role: PortalRole): boolean {
  return role.isAdmin || role.isManagement;
}

export interface RowActions {
  /** 申請ボタン。new: 新しく申請／resubmit: 差戻しを直して再申請 */
  apply: { kind: 'new' } | { kind: 'resubmit'; entry: PortalEntryRow } | null;
  report: boolean;
  /** 承認する申請（承認待ち） */
  approve: PortalEntryRow | null;
  /** 差し戻せる申請（承認待ち・承認済み。取込済みは不可） */
  sendBack: PortalEntryRow | null;
}

/** 報告書に紐付ける申請（承認待ち・承認済み・取込済みのうち新しいもの） */
export function appliedEntry(item: Pick<ScheduleItem, 'entries'>): PortalEntryRow | null {
  return item.entries.find((e) => e.status === 'draft' || e.status === 'ready' || e.status === 'exported') ?? null;
}

/**
 * 報告書の登録（portal_register_report の p_entry_id）に渡す申請 id。
 * DB は申請の property_inspection_id が点検行と一致しないと例外にするので、旧来の申請・1件入力の申請
 * （物件・点検種別・開始月の一致で予定に結び付けたもの。property_inspection_id が無い）は渡さない（null）。
 * p_entry_id は報告書行の参照に入るだけで、ステータスの判定には使わない
 */
export function reportEntryId(item: Pick<ScheduleItem, 'entries' | 'inspection'>): string | null {
  const entry = appliedEntry(item);
  return entry && entry.property_inspection_id === item.inspection.inspection_id ? entry.id : null;
}

export function rowActions(
  item: Pick<ScheduleItem, 'application' | 'entries' | 'reportOnly'>,
  role: PortalRole,
): RowActions {
  // 状態を決めた申請（focusEntry）だけを操作の対象にする。別の申請（過去の月の承認済みなど）を差し戻さないように
  const focus = focusEntry(item.entries);

  let apply: RowActions['apply'] = null;
  // 申請不要（報告書のみ）の点検種別は新しい申請を出さない（修正依頼1025 H4/G4）
  if (canSubmit(role) && !item.reportOnly) {
    if (item.application === 'not_applied') apply = { kind: 'new' };
    else if (item.application === 'sent_back' && focus) apply = { kind: 'resubmit', entry: focus };
  }

  const review = canReview(role);
  return {
    apply,
    report: canSubmit(role),
    approve: review && item.application === 'applied' ? focus : null,
    sendBack: review && focus && (focus.status === 'draft' || focus.status === 'ready') ? focus : null,
  };
}
