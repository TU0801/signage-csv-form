import { useState, useCallback, useEffect } from 'react';
import type { EntryStatus } from '@/lib/constants';

const STORAGE_KEY = 'signage-entries-filters';

export interface EntriesFilters {
  propertyCode: string;
  vendorName: string;
  status: EntryStatus | '';
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: EntriesFilters = {
  propertyCode: '',
  vendorName: '',
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
    // Ignore parse errors
  }
  return defaultFilters;
}

function saveFilters(filters: EntriesFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors
  }
}

export function useEntriesFilters() {
  const [filters, setFilters] = useState<EntriesFilters>(loadFilters);

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  const updateFilter = useCallback(<K extends keyof EntriesFilters>(key: K, value: EntriesFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const hasActiveFilters = filters.propertyCode !== '' || filters.vendorName !== '' || filters.status !== '' || filters.dateFrom !== '' || filters.dateTo !== '';

  return {
    filters,
    updateFilter,
    resetFilters,
    hasActiveFilters,
  };
}

/** Exported for testing */
export { defaultFilters, loadFilters, saveFilters, STORAGE_KEY };
