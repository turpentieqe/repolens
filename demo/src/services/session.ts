import { getSession, setSession } from '@/lib/sessionStore';
import { titleCase } from '@/lib/utils';

export function currentSession() {
  const session = getSession();
  return { ...session, displayName: titleCase(session.displayName) };
}

export function switchWorkspace(workspaceId: string) {
  setSession({ ...getSession(), workspaceId });
}
