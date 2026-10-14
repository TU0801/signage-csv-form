import { describe, it, expect } from 'vitest';
import {
  buildEditUpdates,
  bulkStatusLabel,
  entryApprovalLabel,
  filterExportEntries,
  sortEntries,
  toEditForm,
  toggleEntrySort,
  DEFAULT_ENTRY_SORT,
} from '../lib/entries';
import { makeEntry } from './fixtures';

const noFilters = { propertyCode: '', startDate: '', endDate: '', vendorName: '' };

describe('sortEntries (v1 admin-entries.js sortEntries)', () => {
  it('sorts by created_at desc by default and by property name from master data', () => {
    const a = makeEntry({ id: 'a', property_code: 'P1', created_at: '2026-10-01T00:00:00Z' });
    const b = makeEntry({ id: 'b', property_code: 'P2', created_at: '2026-10-03T00:00:00Z' });
    const c = makeEntry({ id: 'c', property_code: 'P3', created_at: '2026-10-02T00:00:00Z' });
    const names = new Map([
      ['P1', 'さくら'],
      ['P2', 'あおば'],
      ['P3', 'かえで'],
    ]);
    expect(sortEntries([a, b, c], DEFAULT_ENTRY_SORT, names).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(
      sortEntries([a, b, c], { column: 'property_name', ascending: true }, names).map((e) => e.id),
    ).toEqual(['b', 'c', 'a']);
  });

  it('toggles direction on the same column and starts ascending on a new column', () => {
    expect(toggleEntrySort(DEFAULT_ENTRY_SORT, 'created_at')).toEqual({ column: 'created_at', ascending: true });
    expect(toggleEntrySort(DEFAULT_ENTRY_SORT, 'vendor_name')).toEqual({ column: 'vendor_name', ascending: true });
  });
});

describe('filterExportEntries (v1 admin-export.js getFilteredExportEntries)', () => {
  it('exports only approved rows matching property and inspection_start range', () => {
    const rows = [
      makeEntry({ id: 'ok', status: 'ready', inspection_start: '2026-11-01' }),
      makeEntry({ id: 'exported', status: 'exported', inspection_start: '2026-11-15' }),
      makeEntry({ id: 'draft', status: 'draft' }),
      makeEntry({ id: 'pending', status: 'pending' }),
      makeEntry({ id: 'other', status: 'ready', property_code: '9999' }),
      makeEntry({ id: 'late', status: 'ready', inspection_start: '2026-12-01' }),
    ];
    expect(filterExportEntries(rows, noFilters).map((e) => e.id)).toEqual([
      'ok',
      'exported',
      'other',
      'late',
    ]);
    expect(
      filterExportEntries(rows, { ...noFilters, propertyCode: '2010', startDate: '2026-11-01', endDate: '2026-11-30' }).map(
        (e) => e.id,
      ),
    ).toEqual(['ok', 'exported']);
  });
});

describe('status labels', () => {
  it('detail label (v1 showEntryDetail after 0acbc25)', () => {
    expect(entryApprovalLabel('ready')).toBe('承認済み');
    expect(entryApprovalLabel('exported')).toBe('承認済み');
    expect(entryApprovalLabel('pending')).toBe('未申請');
    expect(entryApprovalLabel('draft')).toBe('承認待ち');
  });

  it('bulk change label (v1 updateEntriesStatus)', () => {
    expect(bulkStatusLabel('exported')).toBe('取込済み');
    expect(bulkStatusLabel('ready')).toBe('未取込');
    expect(bulkStatusLabel('pending')).toBe('未申請');
  });
});

describe('edit modal (v1 admin-entry-edit.js)', () => {
  it('fills defaults: display_duration from settings, poster_position 4', () => {
    const form = toEditForm(makeEntry({ display_duration: null, poster_position: null }), 7);
    expect(form.displayDuration).toBe('7');
    expect(form.posterPosition).toBe('4');
  });

  it('sends only display columns; pending edit approves, exported edit returns to ready, ready stays', () => {
    const form = toEditForm(makeEntry(), 6);
    const pending = buildEditUpdates({ ...form, displayStartTime: '' }, 'pending', 'draft', 6);
    expect(pending).toEqual({
      display_start_date: '2026-10-25',
      display_start_time: null,
      display_end_date: '2026-11-02',
      display_end_time: '18:00',
      display_duration: 8,
      poster_position: '1',
      status: 'ready',
    });
    expect(buildEditUpdates(form, 'list', 'exported', 6).status).toBe('ready');
    expect(buildEditUpdates(form, 'list', 'ready', 6)).not.toHaveProperty('status');
    expect(buildEditUpdates({ ...form, displayDuration: '' }, 'list', 'ready', 6).display_duration).toBe(6);
  });
});
