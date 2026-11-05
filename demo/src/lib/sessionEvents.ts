import { getSession } from './sessionStore';

const events: { action: string; actor: string; timestamp: number }[] = [];

export function recordSessionEvent(action: string): void {
  events.push({ action, actor: getSession().userId, timestamp: Date.now() });
  if (events.length > 50) events.shift();
}

export function recentSessionEvents() {
  return events.slice(-10);
}
