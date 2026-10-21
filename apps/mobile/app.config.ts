import type { ExpoConfig, ConfigContext } from 'expo/config';
import { validEndpoint } from './src/services/endpoint.ts';

export default ({ config }: ConfigContext): ExpoConfig => {
  const release = process.env.APP_ENV === 'preview' || process.env.APP_ENV === 'production';
  const endpoint = process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? '';
  if (release && !validEndpoint(endpoint, true)) throw new Error('배포 빌드에는 공개 wss:// 서버의 /lobby 주소가 필요합니다.');
  const id = 'com.jaewon31.boardgame';
  return {
    ...config, name: config.name ?? 'Friends Table', slug: config.slug ?? 'friends-table',
    scheme: 'friendstable',
    plugins: [...(config.plugins ?? []), 'expo-web-browser', ['expo-audio', { microphonePermission:false, recordAudioAndroid:false, enableBackgroundPlayback:false, enableBackgroundRecording:false }]],
    ios: { ...config.ios, bundleIdentifier:id, supportsTablet:false },
    android: { ...config.android, package:id },
    // Set EXPO_PROJECT_ID after running eas init in this workspace.
    extra: { ...config.extra, ...(process.env.EXPO_PROJECT_ID ? {eas:{projectId:process.env.EXPO_PROJECT_ID}} : {}) },
  };
};
