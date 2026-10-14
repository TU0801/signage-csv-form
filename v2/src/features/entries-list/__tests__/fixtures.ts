import type { DbEntry } from '@/types/database';

/** signage_entries の1行（合成データ。列と型は実DBに合わせる: 日付は 'YYYY-MM-DD'、inspection_co は integer） */
export function makeEntry(over: Partial<DbEntry> = {}): DbEntry {
  return {
    id: '11111111-aaaa-4bbb-8ccc-000000000001',
    user_id: 'user-1',
    property_code: '2010',
    terminal_id: 'h0001A00',
    vendor_name: '山田エレベーター',
    emergency_contact: '03-1234-5678',
    inspection_type: 'エレベーター定期点検',
    template_no: '1',
    inspection_start: '2026-11-01',
    inspection_end: '2026-11-02',
    display_start_date: '2026-10-25',
    display_start_time: '09:00',
    display_end_date: '2026-11-02',
    display_end_time: '18:00',
    display_duration: 8,
    announcement: 'ご協力をお願いします',
    remarks: '10時〜12時',
    poster_type: 'template',
    poster_position: '1',
    frame_no: '1',
    status: 'ready',
    poster_image: null,
    inspection_co: 101,
    created_at: '2026-10-01T01:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    ...over,
  };
}
