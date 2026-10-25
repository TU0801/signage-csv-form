import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://x.supabase.co', supabase: {}, TABLES: {}, RPC: {} }));

import { useEntryForm } from '../hooks/useEntryForm';
import { PROPERTIES, SETTINGS, TYPES } from './fixtures';

const lib = (p: string) => `https://x.supabase.co/storage/v1/object/public/poster-images/library/${p}`;
const item = (id: string, url: string, company: string | null) => ({
  id,
  display_name: id,
  category: '注意',
  image_url: url,
  management_company_id: company,
  sort_order: 0,
});

describe('useEntryForm', () => {
  it('物件を変えると管理会社の分のライブラリの貼紙（1枚目・2枚目以降）を外して知らせ、全社共通は残す（ユーザー決定3）', () => {
    const { result } = renderHook(() =>
      useEntryForm({ settings: SETTINGS, properties: PROPERTIES, inspectionTypes: TYPES, linkedIds: new Set() }),
    );
    const company = 'c0000000-0000-4000-8000-000000000009';
    act(() => result.current.changeProperty('120273-00'));
    act(() => {
      result.current.selectLibraryImage(item('L9', lib(`${company}/a.png`), company));
      result.current.addExtraLibrary(item('L9b', lib(`${company}/b.png`), company));
      result.current.addExtraLibrary(item('LC', lib('common/c.png'), null));
    });
    expect(result.current.extraPosters).toHaveLength(2);

    act(() => result.current.changeProperty('2010'));
    expect(result.current.customImage).toBeNull();
    expect(result.current.extraPosters.map((x) => x.libraryId)).toEqual(['LC']);
    expect(result.current.posterNotice).toContain('2枚を外しました');
  });
});
