// Local build only: no Cloudflare/Railway API or deployment command.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { checkEnvironment, checkPwa } = require('./check-web-release.cjs');
const root = path.resolve(__dirname, '..');

async function pagesEnvironment(env) {
  if (env.APP_ENV) throw Error('Leave native APP_ENV unset for the Pages build; web release checks run separately');
  await checkEnvironment({ ...env, EXPO_PUBLIC_WEB_APP_URL: env.EXPO_PUBLIC_WEB_APP_URL || env.CF_PAGES_URL });
  // The app can use window.location.origin when no canonical invitation origin is set.
  // CF_PAGES_URL validates the build environment but is not baked into invite links.
  return { ...env, EXPO_NO_DOTENV: '1', NODE_ENV: 'production' };
}

function checkPages(directory) {
  checkPwa(directory);
  const redirects = fs.readFileSync(path.join(directory, '_redirects'), 'utf8');
  if (!/^\/join\/\*\s+\/\s+200$/m.test(redirects) || /^\/\*\s/m.test(redirects)) throw Error('Pages must rewrite invite routes only');
  // Pages serves index.html only through "/": a 200 rewrite to /index.html becomes a pretty-URL redirect
  // that is not followed when 404.html exists, so invite links would answer 404.
  if (/^\S+\s+\/index\.html\s+200\b/m.test(redirects)) throw Error('Rewrite invite routes to "/", not "/index.html"');
  if (!fs.existsSync(path.join(directory, '404.html'))) throw Error('Pages requires an explicit missing-asset 404');
  const headers = fs.readFileSync(path.join(directory, '_headers'), 'utf8');
  for (const value of ['Cache-Control: no-cache', 'X-Content-Type-Options: nosniff', 'X-Robots-Tag: noindex, nofollow']) {
    if (!headers.includes(value)) throw Error('Missing Pages cache/security header');
  }
  let count = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Unexpected symlink in web output');
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        count++;
        if (fs.statSync(file).size > 25 * 1024 * 1024) throw Error('A web asset exceeds the Pages 25 MiB limit');
        if (/^\.env|\.sqlite(?:-|$)|\.pem$|\.key$/i.test(entry.name)) throw Error('Private file found in web output');
      }
    }
  }
  walk(directory);
  if (count > 20000) throw Error('Web output exceeds the Pages Free file limit');
  return count;
}

module.exports = { pagesEnvironment, checkPages };
if (require.main === module) {
  (async () => {
    const env = await pagesEnvironment(process.env);
    const cli = path.join(root, 'node_modules/expo/bin/cli');
    const result = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', '--output-dir', 'dist-web'], {
      cwd: path.join(root, 'apps/mobile'), env, stdio: 'inherit',
    });
    if (result.error || result.status !== 0) throw Error('Expo web export failed');
    const count = checkPages(path.join(root, 'apps/mobile/dist-web'));
    console.log(`Pages build verified: ${count} static files; no deployment performed`);
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
