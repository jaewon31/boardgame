import * as SecureStore from 'expo-secure-store';
import type { SessionStore, SavedSession } from './RoomClient';

// Serializes writes across React effect remounts as well as individual clients.
let writes: Promise<void> = Promise.resolve();
const key = 'friends-table.session.v1';
export function createSessionStore(endpoint: string): SessionStore {
  return {
    async load() {
      await writes.catch(() => {});
      const text = await SecureStore.getItemAsync(key);
      if (!text) return null;
      try {
        const saved = JSON.parse(text);
        if (saved.endpoint !== endpoint) return null; // Never send a token to a different server.
        if (saved.version !== 1 || !/^[A-Z2-9]{8}$/.test(saved.code) || !/^[a-f0-9]{64}$/.test(saved.token)) return null;
        return { code: saved.code, token: saved.token } as SavedSession;
      } catch { return null; }
    },
    save(session) {
      writes = writes.catch(() => {}).then(() => session
        ? SecureStore.setItemAsync(key, JSON.stringify({version:1, endpoint, ...session}), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
        : SecureStore.deleteItemAsync(key));
      return writes;
    },
  };
}
