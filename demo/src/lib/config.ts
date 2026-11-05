import { slug } from './utils';

export const config = {
  apiUrl: '/api/v1',
  workspaceId: slug('Orbit Labs'),
  refreshInterval: 30_000,
} as const;
