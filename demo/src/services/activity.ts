import { readCache } from './api';
import type { Activity } from '@/types/activity';

const preview: Activity[] = [
  {
    id: 'evt-101',
    actor: 'Maya Chen',
    action: 'deployed the analytics service',
    createdAt: '2026-11-05T09:40:00Z',
  },
  {
    id: 'evt-102',
    actor: 'Eli Brooks',
    action: 'invited two teammates',
    createdAt: '2026-11-05T09:15:00Z',
  },
  {
    id: 'evt-103',
    actor: 'Sam Rivera',
    action: 'updated the weekly target',
    createdAt: '2026-11-05T08:30:00Z',
  },
];

export function getRecentActivity(): Activity[] {
  return readCache<Activity[]>('/activity', preview).slice(0, 6);
}
