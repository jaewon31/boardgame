const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pagesEnvironment, checkPages } = require('../../../scripts/build-pages.cjs');
const publicDir = path.join(__dirname, '../public');
const config = {
  CF_PAGES_URL: 'https://test-build.pages.dev',
  EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'wss://boardgameserver-production.up.railway.app/lobby',
  EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
test('Pages build validates release config, ignores local dotenv and keeps native settings untouched', async () => {
  const env = await pagesEnvironment(config);
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.EXPO_PUBLIC_WEB_APP_URL, undefined);
  assert.equal(config.NODE_ENV, undefined);
  await assert.rejects(pagesEnvironment({ ...config, EXPO_PUBLIC_WEB_GAME_SERVER_URL: 'https://boardgameserver-production.up.railway.app' }));
  await assert.rejects(pagesEnvironment({ ...config, CF_PAGES_URL: undefined }));
  await assert.rejects(pagesEnvironment({ ...config, APP_ENV: 'production' }));
});
test('Pages assets preserve invite routes, strict 404s, caching and private-file exclusion', t => {
  assert.ok(checkPages(publicDir) >= 7);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-assets-'));
  t.after(() => {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'pages-assets-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  fs.cpSync(publicDir, temp, { recursive: true });
  fs.writeFileSync(path.join(temp, '.env.local'), 'test fixture');
  assert.throws(() => checkPages(temp), /Private file/);
  fs.unlinkSync(path.join(temp, '.env.local'));
  fs.writeFileSync(path.join(temp, '_redirects'), '/* /index.html 200');
  assert.throws(() => checkPages(temp), /invite routes only/);
});
