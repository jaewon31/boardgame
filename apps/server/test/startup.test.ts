import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
function environment(dir: string): NodeJS.ProcessEnv {
  // Do not inherit local credentials, NODE_OPTIONS, or application settings.
  return {
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: 'production', HOST: '127.0.0.1',
    STATE_DB_PATH: join(dir, 'state.sqlite'),
    STATS_DB_PATH: join(dir, 'stats.sqlite'),
    SUPABASE_URL: 'https://ci-placeholder.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder_not_a_real_key',
  };
}

test('production entry point rejects each missing or empty authentication variable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'boardgame-startup-'));
  try {
    for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
      for (const value of [undefined, '']) {
        const env = environment(dir);
        if (value === undefined) delete env[key]; else env[key] = value;
        const result = spawnSync(process.execPath, [entry], { env, encoding: 'utf8', timeout: 5000 });
        assert.ifError(result.error);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('production entry point serves health before and after restart with the same temporary databases', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'boardgame-startup-'));
  // Reserve a free local port, then release it for the real entry point.
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  try {
    for (let run = 0; run < 2; run++) {
      const child = spawn(process.execPath, [entry], {
        env: { ...environment(dir), PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const closed = once(child, 'close');
      let output = '';
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      try {
        let healthy = false;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          assert.equal(child.exitCode, null, output);
          try {
            const response = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { status: 'ok', service: 'boardgame-server' });
            healthy = true;
            break;
          } catch {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        assert.ok(healthy, 'Server did not become healthy: ' + output);
      } finally {
        child.kill();
        await closed;
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
