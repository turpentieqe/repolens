import { slug } from '@/lib/utils';

export function StatusBadge({ label, healthy }: { label: string; healthy: boolean }) {
  return (
    <span className={`badge badge-${slug(label)}`} data-healthy={healthy}>
      {label}
    </span>
  );
}
