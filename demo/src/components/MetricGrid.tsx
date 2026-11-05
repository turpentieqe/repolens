import { MetricCard } from './MetricCard';
import type { Metric } from '@/types/metric';

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <section aria-label="Workspace metrics">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}
