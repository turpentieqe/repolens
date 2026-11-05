import { useSession } from '@/hooks/useSession';
import { initials } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

export function Header() {
  const session = useSession();

  return (
    <header>
      <h1>Orbit Dashboard</h1>
      <span title={session.displayName}>{initials(session.displayName)}</span>
      <StatusBadge label={session.role} healthy={session.isActive} />
    </header>
  );
}
