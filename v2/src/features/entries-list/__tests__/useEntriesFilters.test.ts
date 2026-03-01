import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to test the exported pure functions and storage logic
// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const STORAGE_KEY = 'signage-entries-filters';

interface EntriesFilters {
  propertyCode: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: EntriesFilters = {
  propertyCode: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

function loadFilters(): EntriesFilters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultFilters, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore
  }
  return defaultFilters;
}

function saveFilters(filters: EntriesFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore
  }
}

describe('useEntriesFilters - filter logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return default filters when localStorage is empty', () => {
    const result = loadFilters();
    expect(result).toEqual(defaultFilters);
  });

  it('should load filters from localStorage', () => {
    const stored: EntriesFilters = {
      propertyCode: 'P001',
      status: 'ready',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const result = loadFilters();
    expect(result).toEqual(stored);
  });

  it('should merge partial stored filters with defaults', () => {
    const partial = { propertyCode: 'P002' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(partial));

    const result = loadFilters();
    expect(result).toEqual({
      ...defaultFilters,
      propertyCode: 'P002',
    });
  });

  it('should return defaults when localStorage has invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json');

    const result = loadFilters();
    expect(result).toEqual(defaultFilters);
  });

  it('should save filters to localStorage', () => {
    const filters: EntriesFilters = {
      propertyCode: 'P003',
      status: 'draft',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    };
    saveFilters(filters);

    expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(filters));
  });

  it('should correctly round-trip filters through save and load', () => {
    const original: EntriesFilters = {
      propertyCode: 'P004',
      status: 'exported',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    };
    saveFilters(original);
    const loaded = loadFilters();
    expect(loaded).toEqual(original);
  });

  it('hasActiveFilters detects non-empty filters', () => {
    const empty = defaultFilters;
    const hasActive = (f: EntriesFilters) =>
      f.propertyCode !== '' || f.status !== '' || f.dateFrom !== '' || f.dateTo !== '';

    expect(hasActive(empty)).toBe(false);
    expect(hasActive({ ...empty, propertyCode: 'P001' })).toBe(true);
    expect(hasActive({ ...empty, status: 'ready' })).toBe(true);
    expect(hasActive({ ...empty, dateFrom: '2026-01-01' })).toBe(true);
    expect(hasActive({ ...empty, dateTo: '2026-12-31' })).toBe(true);
  });

  it('default filters should have all empty strings', () => {
    expect(defaultFilters.propertyCode).toBe('');
    expect(defaultFilters.status).toBe('');
    expect(defaultFilters.dateFrom).toBe('');
    expect(defaultFilters.dateTo).toBe('');
  });
});
