import { config } from '@/lib/config';

const cache = new Map<string, unknown>();

export async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: { 'X-Workspace': config.workspaceId },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const data = (await response.json()) as T;
  cache.set(path, data);
  return data;
}

export function readCache<T>(path: string, fallback: T): T {
  return cache.has(path) ? (cache.get(path) as T) : fallback;
}
