import { currentSession } from '@/services/session';
import { titleCase } from '@/lib/utils';

export function useSession() {
  const session = currentSession();
  return { ...session, role: titleCase(session.role), isActive: session.expiresAt > Date.now() };
}
