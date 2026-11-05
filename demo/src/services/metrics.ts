import { request } from './api';
import type { Metric } from '@/types/metric';
import { clamp } from '@/lib/utils';

export async function loadMetrics(): Promise<Metric[]> {
  const metrics = await request<Metric[]>('/metrics');
  return metrics.map((metric) => ({ ...metric, trend: clamp(metric.trend, -100, 100) }));
}
