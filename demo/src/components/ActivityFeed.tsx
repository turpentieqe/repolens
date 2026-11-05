import { useActivity } from '@/hooks/useActivity';
import { initials } from '@/lib/utils';

export function ActivityFeed() {
  const activities = useActivity();

  return (
    <section aria-label="Recent activity">
      <h2>Mission log</h2>
      <ul>
        {activities.map((activity) => (
          <li key={activity.id}>
            <span>{initials(activity.actor)}</span>
            <p>
              {activity.actor} {activity.action}
            </p>
            <time dateTime={activity.createdAt}>{activity.age}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
