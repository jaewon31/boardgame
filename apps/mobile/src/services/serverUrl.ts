import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getServerUrl(): string {
  const configured = process.env.EXPO_PUBLIC_GAME_SERVER_URL?.trim();
  if (configured) return configured;
  if (!__DEV__) return ''; // Production must explicitly configure a secure public endpoint.
  const hostUri = Constants.expoConfig?.hostUri;
  let host = hostUri?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  }
  return `ws://${host}:3000/lobby`;
}
