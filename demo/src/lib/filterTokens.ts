import { normalizeFilter } from './filters';

export function parseFilterTokens(expression: string): string[] {
  return [...new Set(expression.split(',').map(normalizeFilter))];
}
