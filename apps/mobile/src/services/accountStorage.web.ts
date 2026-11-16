import { browserStorage, validBrowserAuth } from './browserStorage';

// Atomic single-value writes; Supabase owns token refresh, removal and tab sync.
// Keep the account marker on sign-out so expiry never silently creates a new user.
export const accountStorage = browserStorage(() => window.localStorage, 'friends-table.auth.v1.', validBrowserAuth);
export const prepareAccountStorage = () => accountStorage.prepare();
