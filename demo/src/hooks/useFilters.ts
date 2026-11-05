import { useState } from 'react';
import { matchesFilter, normalizeFilter } from '@/lib/filters';

export function useFilters() {
  const [filter, updateFilter] = useState('all');
  const setFilter = (value: string) => updateFilter(normalizeFilter(value));
  const matches = (category: string) => matchesFilter(category, filter);
  return { filter, setFilter, matches };
}
