import type { SessionStore } from './RoomClient';

// The authenticated client restores via currentRoom on the server, not a saved
// room credential. Do not retain redundant bearer credentials in browser storage.
export function createSessionStore(_endpoint: string): SessionStore {
  return { async load() { return null; }, async save() {} };
}
