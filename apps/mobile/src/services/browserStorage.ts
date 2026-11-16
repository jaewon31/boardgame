export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class BrowserStorageError extends Error {
  readonly code = 'browser_storage_unavailable';
  constructor() { super('Browser storage is unavailable or invalid'); }
}
// Resolve storage lazily: importing the module must work without a browser too.
export function browserStorage(resolve: () => BrowserStorage, namespace: string, validate: (key: string, value: string) => boolean) {
  function checked(key: string, value: string) {
    if (!key || key.length > 200 || value.length > 100000 || !validate(key, value)) throw new BrowserStorageError();
  }
  return {
    async prepare() {
      try {
        const storage = resolve(), key = namespace + 'probe.' + Math.random().toString(36).slice(2);
        storage.setItem(key, '1');
        const readable = storage.getItem(key) === '1';
        storage.removeItem(key);
        if (!readable) throw new BrowserStorageError();
      } catch { throw new BrowserStorageError(); }
    },
    async getItem(key: string) {
      try {
        const value = resolve().getItem(namespace + key);
        if (value !== null) checked(key, value);
        return value;
      } catch { throw new BrowserStorageError(); }
    },
    async setItem(key: string, value: string) {
      try { checked(key, value); resolve().setItem(namespace + key, value); }
      catch { throw new BrowserStorageError(); }
    },
    async removeItem(key: string) {
      try { resolve().removeItem(namespace + key); }
      catch { throw new BrowserStorageError(); }
    },
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validBrowserAuth(key: string, value: string): boolean {
  if (key === 'friends-table-account-id') return uuid.test(value);
  try {
    const data = JSON.parse(value);
    if (key.endsWith('-code-verifier')) return typeof data === 'string' && data.length <= 512;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (key.endsWith('-user')) return uuid.test(data.user?.id ?? '');
    return key.endsWith('-auth-token') && typeof data.access_token === 'string' && data.access_token.length > 0
      && typeof data.refresh_token === 'string' && data.refresh_token.length > 0
      && Number.isFinite(data.expires_at) && uuid.test(data.user?.id ?? '');
  } catch { return false; }
}
export function validBrowserSettings(key: string, value: string): boolean {
  if (key !== 'table-audio') return false;
  try {
    const data = JSON.parse(value);
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && typeof data.muted === 'boolean' && typeof data.level === 'number' && data.level >= 0 && data.level <= 1
      && !!data.gains && typeof data.gains === 'object' && !Array.isArray(data.gains)
      && Object.values(data.gains).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
  } catch { return false; }
}
