import { webEndpoint } from './webEndpoint';
export function getServerUrl(): string {
  return webEndpoint(process.env.EXPO_PUBLIC_WEB_GAME_SERVER_URL ?? process.env.EXPO_PUBLIC_GAME_SERVER_URL, __DEV__, typeof window === 'undefined' ? undefined : window.location);
}
