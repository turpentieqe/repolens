import { Header } from '@/components/Header';
import { MetricGrid } from '@/components/MetricGrid';
import { ActivityFeed } from '@/components/ActivityFeed';
import { FilterBar } from '@/components/FilterBar';
import { useDashboard } from '@/hooks/useDashboard';
import { config } from '@/lib/config';

export function Dashboard() {
  const { metrics, filter, setFilter, health, error } = useDashboard();

  return (
    <main data-workspace={config.workspaceId}>
      <Header />
      <FilterBar value={filter} onChange={setFilter} />
      {error ? <p role="alert">{error}</p> : <MetricGrid metrics={metrics} />}
      <p>Workspace health: {health}%</p>
      <ActivityFeed />
    </main>
  );
}
