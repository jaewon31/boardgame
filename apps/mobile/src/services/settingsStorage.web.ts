import { browserStorage, validBrowserSettings } from './browserStorage';
const storage = browserStorage(() => window.localStorage, 'friends-table.settings.v1.', validBrowserSettings);
export const getItemAsync = storage.getItem;
export const setItemAsync = storage.setItem;
export const deleteItemAsync = storage.removeItem;
