import { compactNumber } from '@/lib/utils';
import type { Metric } from '@/types/metric';

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article>
      <h2>{metric.label}</h2>
      <strong>
        {compactNumber(metric.value)} {metric.unit}
      </strong>
      <small data-direction={metric.trend >= 0 ? 'up' : 'down'}>
        {metric.trend >= 0 ? '+' : ''}
        {metric.trend}% this week
      </small>
    </article>
  );
}
