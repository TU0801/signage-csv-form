import { describe, expect, it } from 'vitest';
import { normalizeSearch } from '../utils';

describe('normalizeSearch', () => {
  it('ひらがな・カタカナ、全角・半角、大文字・小文字、空白の違いを無視する', () => {
    expect(normalizeSearch('ぐらんでぃーる')).toBe(normalizeSearch('グランディール'));
    expect(normalizeSearch('ﾛﾏﾈｽｸ')).toBe(normalizeSearch('ロマネスク'));
    expect(normalizeSearch('Ｚ００１５Ａ０１')).toBe('z0015a01');
    expect(normalizeSearch('パーク アソシア　大橋')).toBe('パークアソシア大橋');
  });
});
