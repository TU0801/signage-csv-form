import type { DbInspectionReport } from '@/types/portal';

/** テスト用の報告書（実在の物件名・社名は使わない） */
export function makeReport(overrides: Partial<DbInspectionReport> = {}): DbInspectionReport {
  return {
    id: 'r1',
    property_inspection_id: 'pi1',
    property_code: '100001',
    property_name: 'テスト第一ビル',
    inspection_type_id: 't1',
    inspection_type_label: '消防設備点検',
    vendor_id: 'v1',
    vendor_name: 'テスト保守',
    target_month: '2026-10-01',
    performed_on: '2026-10-05',
    entry_id: null,
    file_name: '20261005_テスト第一ビル_消防設備点検.pdf',
    original_name: 'scan.pdf',
    size_bytes: 1024,
    mime: 'application/pdf',
    content_hash: 'h1',
    storage_backend: 'supabase',
    storage_path: 'pi1/u1.pdf',
    status: 'submitted',
    status_before_delete: null,
    note: null,
    review_comment: null,
    reviewed_by: null,
    reviewed_at: null,
    uploaded_by: 'u1',
    archived_at: null,
    retention_until: null,
    created_at: '2026-10-05T01:00:00Z',
    updated_at: '2026-10-05T01:00:00Z',
    ...overrides,
  };
}
