const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function checkPwa(directory) {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/'); // Never persist invite codes or credentials in the launch URL.
  assert.ok(manifest.name && manifest.short_name);
  for (const color of [manifest.theme_color, manifest.background_color]) assert.match(color, /^#[\da-f]{6}$/i);
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /viewport-fit=cover/);
  function png(relative, size) {
    const file = path.resolve(directory, '.' + relative);
    assert.ok(file.startsWith(path.resolve(directory) + path.sep));
    const data = fs.readFileSync(file);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(i => i.sizes === `${size}x${size}` && i.type === 'image/png');
    assert.ok(icon);
    png(icon.src, size);
  }
  png('/icons/apple-touch-icon.png', 180);
  assert.match(html, /rel="apple-touch-icon"/);
  return true;
}

async function checkEnvironment(env) {
  const { validEndpoint } = await import('../apps/mobile/src/services/endpoint.ts');
  const { parseOrigins } = await import('../apps/server/src/origins.ts');
  const errors = [];
  const app = env.EXPO_PUBLIC_WEB_APP_URL;
  try { if (!app || parseOrigins(app, true).length !== 1) throw Error(); }
  catch { errors.push('EXPO_PUBLIC_WEB_APP_URL must be one exact HTTPS origin'); }
  if (!validEndpoint(env.EXPO_PUBLIC_WEB_GAME_SERVER_URL ?? '', true)) errors.push('EXPO_PUBLIC_WEB_GAME_SERVER_URL must be a public WSS /lobby endpoint');
  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(env.EXPO_PUBLIC_SUPABASE_URL ?? '')) errors.push('EXPO_PUBLIC_SUPABASE_URL must be the HTTPS Supabase project URL');
  if (!env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) errors.push('Use a Supabase publishable key, never an admin/service-role key');
  if (env.WEB_ALLOWED_ORIGINS !== undefined) {
    try { if (!parseOrigins(env.WEB_ALLOWED_ORIGINS, true).includes(app)) throw Error(); }
    catch { errors.push('Server WEB_ALLOWED_ORIGINS must explicitly include the web origin'); }
  }
  // Report only field names and requirements. Never echo environment values.
  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

module.exports = { checkPwa, checkEnvironment };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes('--environment')) await checkEnvironment(process.env);
    const directory = args.find(a => !a.startsWith('--'));
    if (directory) checkPwa(path.resolve(directory));
    if (!directory && !args.includes('--environment')) throw Error('Usage: node scripts/check-web-release.cjs [--environment] [export-directory]');
    console.log('Web release checks passed (local configuration/assets only; not a live TLS check)');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
