import * as SecureStore from 'expo-secure-store';
import { authStorage } from './authStorage';

// Default/native implementation: preserve the existing keys and chunked format.
export const accountStorage = authStorage(SecureStore);
export async function prepareAccountStorage(): Promise<void> {}
