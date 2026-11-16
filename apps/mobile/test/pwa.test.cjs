const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { checkPwa, checkEnvironment } = require('../../../scripts/check-web-release.cjs');

test('install metadata references valid sized icons and a credential-free launch URL', () => {
  assert.equal(checkPwa(path.join(__dirname, '../public')), true);
});
test('release checks reject mixed content, secrets and mismatched/wildcard origins without leaking values', async () => {
  const good = {
    EXPO_PUBLIC_WEB_APP_URL: 'https://play.friendstable.com',
    EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'wss://game.friendstable.com/lobby',
    EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    WEB_ALLOWED_ORIGINS: 'https://play.friendstable.com',
  };
  assert.equal(await checkEnvironment(good), true);
  for (const change of [
    { EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'ws://game.friendstable.com/lobby' },
    { EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'wss://game.friendstable.com/lobby?token=secret-test' },
    { EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'wss://localhost/lobby' },
    { EXPO_PUBLIC_WEB_APP_URL: 'http://play.friendstable.com' },
    { EXPO_PUBLIC_SUPABASE_URL: 'http://test.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'secret-test' },
    { WEB_ALLOWED_ORIGINS: '*' },
    { WEB_ALLOWED_ORIGINS: 'https://another.friendstable.com' },
  ]) await assert.rejects(checkEnvironment({ ...good, ...change }), e => !e.message.includes('secret-test'));
});
