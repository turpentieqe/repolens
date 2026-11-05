import { useEffect, useState } from 'react';
import { loadMetrics } from '@/services/metrics';
import { useFilters } from './useFilters';
import { clamp } from '@/lib/utils';

export function useDashboard() {
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof loadMetrics>>>([]);
  const [error, setError] = useState<string | null>(null);
  const { filter, setFilter, matches } = useFilters();

  useEffect(() => {
    let cancelled = false;
    loadMetrics().then(
      (result) => {
        if (!cancelled) setMetrics(result);
      },
      () => {
        if (!cancelled) setError('Unable to load workspace metrics.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = metrics.filter((metric) => matches(metric.category));
  const health = clamp(100 + visible.reduce((sum, metric) => sum + metric.trend, 0), 0, 100);
  return { metrics: visible, filter, setFilter, health, error };
}
