import { describe, it, expect } from 'vitest';
import { bulkApproveMessage } from '../lib/bulkApproveMessage';

describe('一括承認の結果の知らせ（修正依頼1026 後続）', () => {
  it('通った件数と断られた件数を出す（全部通った・一部・全部断られたで同じ形）', () => {
    const base = { succeeded: 0, stale: 0, otherFailed: 0, otherReason: '', blocked: 0 };
    expect(bulkApproveMessage({ ...base, succeeded: 3 })).toEqual({ message: '3件を承認しました', tone: 'success' });
    expect(bulkApproveMessage({ ...base, succeeded: 3, stale: 1 })).toEqual({
      message: '3件を承認しました（1件は修正されていたため承認していません）',
      tone: 'error',
    });
    expect(bulkApproveMessage({ ...base, succeeded: 2, otherFailed: 1, otherReason: '権限がありません', blocked: 1 })).toEqual({
      message: '2件を承認しました（1件は承認できませんでした: 権限がありません。建物未承認の1件は承認していません）',
      tone: 'error',
    });
    expect(bulkApproveMessage({ ...base, stale: 2 })).toEqual({
      message: '承認できませんでした（2件は修正されていたため承認していません）',
      tone: 'error',
    });
  });
});
