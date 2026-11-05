export interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: number;
  category: 'traffic' | 'revenue' | 'reliability';
}
