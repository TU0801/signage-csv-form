import { describe, expect, it } from 'vitest';
import { defaultNotifyFor } from '../inspectionSchedule';

describe('点検日連絡の既定（業務システム schedule-fields.ts と同じ判定。修正依頼1029 D3）', () => {
  it('リモート点検・警備を含む種別とデジタルサイネージ点検は OFF、それ以外は ON', () => {
    expect(defaultNotifyFor('リモート点検')).toBe(false);
    expect(defaultNotifyFor('警備報告')).toBe(false);
    expect(defaultNotifyFor('デジタルサイネージ点検')).toBe(false);
    expect(defaultNotifyFor('デジタルサイネージ点検（臨時）')).toBe(true);
    expect(defaultNotifyFor('法定点検')).toBe(true);
    expect(defaultNotifyFor(null)).toBe(true);
  });
});
