import { titleCase } from '@/lib/utils';
import { filterOptions } from '@/lib/filters';

export function FilterBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav aria-label="Metric filters">
      {filterOptions.map((option) => (
        <button key={option} aria-pressed={value === option} onClick={() => onChange(option)}>
          {titleCase(option)}
        </button>
      ))}
    </nav>
  );
}
