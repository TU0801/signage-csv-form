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

export function rowActions(item: Pick<ScheduleItem, 'application' | 'entries'>, role: PortalRole): RowActions {
  // 状態を決めた申請（focusEntry）だけを操作の対象にする。別の申請（過去の月の承認済みなど）を差し戻さないように
  const focus = focusEntry(item.entries);

  let apply: RowActions['apply'] = null;
  if (canSubmit(role)) {
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
