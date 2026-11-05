import { recordSessionEvent } from './sessionEvents';

let session = {
  userId: 'user-maya',
  displayName: 'Maya Chen',
  role: 'admin',
  workspaceId: 'orbit-labs',
  expiresAt: Date.now() + 3_600_000,
};

export function getSession() {
  return { ...session };
}

export function setSession(next: typeof session): void {
  const previousWorkspace = session.workspaceId;
  session = { ...next };
  recordSessionEvent(
    previousWorkspace === next.workspaceId ? 'session-refreshed' : 'workspace-changed',
  );
}
