import { describe, it, expect } from 'vitest';
import { todayUtc } from '../utils';

describe('今日（v1 の new Date().toISOString().split("T")[0]）', () => {
  it('UTC の日付を返すので、日本時間 0〜9 時は前日になる（v1 と同じ。不具合候補として報告済み）', () => {
    expect(todayUtc(new Date('2026-10-15T08:59:00+09:00'))).toBe('2026-10-14');
    expect(todayUtc(new Date('2026-10-15T09:00:00+09:00'))).toBe('2026-10-15');
  });
});
