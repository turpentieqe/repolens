import { getRecentActivity } from '@/services/activity';
import { relativeTime } from '@/lib/utils';

export function useActivity() {
  return getRecentActivity().map((activity) => ({
    ...activity,
    age: relativeTime(activity.createdAt),
  }));
}
