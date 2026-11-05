import { parseFilterTokens } from './filterTokens';

export const filterOptions = ['all', 'traffic', 'revenue', 'reliability'] as const;

export function normalizeFilter(value: string): string {
  return value.trim().toLowerCase() || 'all';
}

export function matchesFilter(category: string, expression: string): boolean {
  const tokens = parseFilterTokens(expression);
  return tokens.includes('all') || tokens.includes(normalizeFilter(category));
}
