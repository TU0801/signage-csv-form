import { describe, expect, it } from 'vitest';
import { reportEntryId, rowActions } from '../lib/actions';
import { makeEntry, makeInspection } from './fixtures';

const vendor = { isAdmin: false, isManagement: false };
const management = { isAdmin: false, isManagement: true };
const admin = { isAdmin: true, isManagement: false };

describe('行の操作（ロール別）', () => {
  it('保守会社: 未申請は申請と報告書。承認・差戻しは出さない', () => {
    const a = rowActions({ application: 'not_applied', entries: [] }, vendor);
    expect(a.apply).toEqual({ kind: 'new' });
    expect(a.report).toBe(true);
    expect(a.approve).toBeNull();
    expect(a.sendBack).toBeNull();
  });

  it('保守会社: 差戻しは差し戻された申請を直して再申請。申請済みには申請を出さず報告書は出す', () => {
    const sentBack = makeEntry({ status: 'pending', review_comment: '日付違い' });
    expect(rowActions({ application: 'sent_back', entries: [sentBack] }, vendor).apply).toEqual({ kind: 'resubmit', entry: sentBack });
    const applied = rowActions({ application: 'applied', entries: [makeEntry()] }, vendor);
    expect(applied.apply).toBeNull();
    expect(applied.report).toBe(true);
  });

  it('管理会社: 申請済みに承認と差戻し。申請・報告書の提出は出さない', () => {
    const draft = makeEntry();
    const a = rowActions({ application: 'applied', entries: [draft] }, management);
    expect(a.approve).toBe(draft);
    expect(a.sendBack).toBe(draft);
    expect(a.apply).toBeNull();
    expect(a.report).toBe(false);
    expect(rowActions({ application: 'not_applied', entries: [] }, management).apply).toBeNull();
  });

  it('承認済みは差戻しだけ、取込済みは何もできない', () => {
    const ready = makeEntry({ status: 'ready' });
    const a = rowActions({ application: 'approved', entries: [ready] }, management);
    expect(a.approve).toBeNull();
    expect(a.sendBack).toBe(ready);
    const exported = rowActions({ application: 'approved', entries: [makeEntry({ status: 'exported' })] }, management);
    expect(exported.sendBack).toBeNull();
  });

  it('差戻し中の申請があれば、過去の承認済みの申請ではなく差戻しを操作の対象にする', () => {
    const sentBack = makeEntry({ id: 'new', status: 'pending', review_comment: '日付違い' });
    const oldReady = makeEntry({ id: 'old', status: 'ready', created_at: '2026-04-01T00:00:00Z' });
    expect(rowActions({ application: 'sent_back', entries: [sentBack, oldReady] }, vendor).apply).toEqual({ kind: 'resubmit', entry: sentBack });
    expect(rowActions({ application: 'sent_back', entries: [sentBack, oldReady] }, management).sendBack).toBeNull();
  });

  it('管理者は申請・報告書・承認・差戻しのすべて', () => {
    expect(rowActions({ application: 'not_applied', entries: [] }, admin).apply).toEqual({ kind: 'new' });
    const draft = makeEntry();
    const a = rowActions({ application: 'applied', entries: [draft] }, admin);
    expect(a.report).toBe(true);
    expect(a.approve).toBe(draft);
    expect(a.sendBack).toBe(draft);
  });
});

describe('報告書に渡す申請 id（修正依頼1024 F3）', () => {
  it('点検行に紐付いた申請だけ渡し、旧来・1件入力の申請（property_inspection_id なし）は null にする', () => {
    const inspection = makeInspection();
    expect(reportEntryId({ inspection, entries: [makeEntry({ id: 'linked' })] })).toBe('linked');
    expect(reportEntryId({ inspection, entries: [makeEntry({ id: 'legacy', property_inspection_id: null, target_month: null })] })).toBeNull();
  });
});
