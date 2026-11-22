// LOCAL BROWSER E2E ONLY — 4 real browsers against a local game server.
// No production Supabase/Railway/Cloudflare: the server binds 127.0.0.1, uses an in-memory lobby
// and a per-run test token table; the page's `authClient`/`serverUrl` modules are replaced only
// inside this script's esbuild bundle. The app build (Expo/Pages) never includes any of this.
// Usage: node scripts/test-game-e2e.cjs   (ESBUILD_PATH / PLAYWRIGHT_PATH / CHROME_PATH optional)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.CF_PAGES) throw new Error('Local E2E harness refuses to run in a deployed environment');
const HOST = '127.0.0.1';
const root = path.resolve(__dirname, '..'), out = path.join(root, '.qa-web/game-e2e');
const load = (env, fallback) => require(process.env[env] ?? path.join(root, '.qa-web/node_modules', fallback));
const { build } = load('ESBUILD_PATH', 'esbuild');
const { chromium } = load('PLAYWRIGHT_PATH', 'playwright');
const USERS = ['A', 'B', 'C', 'D'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bundle() {
  const fixtures = {
    // Test identity comes from the harness page; there is no Supabase client in this bundle.
    authClient: `const id = window.__friendsTableE2E;
export const authConfigured = true;
export const authClient = { auth: { getSession: async () => ({ data: { session: id ? { user: { id: id.accountId }, access_token: id.token } : null } }) } };`,
    serverUrl: `export const getServerUrl = () => 'ws://' + location.host + '/lobby';`,
  };
  const result = await build({ entryPoints: [path.join(root, 'apps/mobile/test/browser/game-e2e-fixture.jsx')], bundle: true, write: false,
    plugins: [{ name: 'local-e2e-fixtures', setup(b) {
      b.onResolve({ filter: /\/(authClient|serverUrl)$/ }, args => ({ path: args.path.split('/').pop(), namespace: 'e2e-fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'e2e-fixture' }, ({ path: p }) => ({ contents: fixtures[p], loader: 'js' }));
      // Inline sounds as audio/wav: esbuild's dataurl MIME for .wav (audio/wave) is not playable in Chrome.
      b.onLoad({ filter: /\.wav$/ }, args => ({ contents: `module.exports=${JSON.stringify('data:audio/wav;base64,' + fs.readFileSync(args.path).toString('base64'))};`, loader: 'js' }));
      // Type-only re-exports with no runtime values (expo-modules-core ts-declarations).
      b.onLoad({ filter: /expo-modules-core[\\/]build[\\/]ts-declarations[\\/]global\.js$/ }, () => ({ contents: '', loader: 'js' }));
    } }],
    platform: 'browser', format: 'iife', jsx: 'automatic', banner: { js: 'var process={env:{NODE_ENV:"production"}};' },
    // Metro passes `global` into every module; esbuild does not (react-native-web Animated uses it).
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: { '@react-native/assets-registry/registry': path.join(root, 'node_modules/react-native-web/dist/modules/AssetRegistry/index.js'),
      'react-native': path.join(root, 'apps/mobile/test/browser/native-web-shim.js'), 'react-native-svg': path.join(root, 'node_modules/react-native-svg/src/ReactNativeSVG.web.ts') },
    loader: { '.png': 'dataurl' }, logLevel: 'error' });
  return result.outputFiles[0].text;
}

async function startServer(js) {
  const { createAppServer } = await import(pathToFileURL(path.join(root, 'apps/server/src/http.ts')).href);
  const { attachLobby } = await import(pathToFileURL(path.join(root, 'apps/server/src/lobby.ts')).href);
  // Per-run random tokens → fixed local test identities. Nothing else is accepted.
  const identities = new Map(USERS.map((u, i) => [u, { token: 'e2e-' + crypto.randomBytes(24).toString('hex'), accountId: `00000000-0000-4000-8000-00000000000${i + 1}`, sessionId: `00000000-0000-4000-9000-00000000000${i + 1}` }]));
  const byToken = new Map([...identities.values()].map(v => [v.token, v]));
  const serverTiming = [];
  let origin = '';
  const server = createAppServer(() => true, async (request, response) => {
    const url = new URL(request.url, 'http://local');
    if (url.pathname === '/e2e.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); return true; }
    if (url.pathname === '/' && identities.has(url.searchParams.get('user'))) {
      const id = identities.get(url.searchParams.get('user'));
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta charset="utf-8"><title>E2E ${url.searchParams.get('user')}</title><style>html,body,#root{height:100%;margin:0;display:flex;flex-direction:column}</style>
<script>window.__friendsTableE2E=${JSON.stringify({ accountId: id.accountId, token: id.token })};</script><div id="root"></div><script src="/e2e.js"></script>`);
      return true;
    }
    return false;
  }, []);
  await new Promise(r => server.listen(0, HOST, r));
  origin = `http://${HOST}:${server.address().port}`;
  const lobby = attachLobby(server, { allowedOrigins: [origin], diagnostic: () => {}, gameTiming: e => serverTiming.push(e),
    authorize: async token => { const id = byToken.get(token); return id ? { accountId: id.accountId, sessionId: id.sessionId } : null; } });
  return { origin, serverTiming, close: () => { lobby.close(); server.close(); } };
}

// Board faces in the community area, counted from the DOM (no card values are kept).
function domObserver() {
  localStorage.setItem('friends-table.diagnostics.game-timing', '1');
  window.__e2eDom = []; let last = -1;
  const scan = () => {
    const area = document.querySelector('[data-testid="web-community"]');
    const faces = area ? [...area.querySelectorAll('[aria-label]')].filter(e => /(스페이드|하트|다이아|클로버)$/.test(e.getAttribute('aria-label') ?? '')).length : 0;
    if (faces !== last) { last = faces; const domAt = performance.now(); requestAnimationFrame(() => window.__e2eDom.push({ faces, domAt, frameAt: performance.now() })); }
  };
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true, attributes: true }));
}

const view = page => page.evaluate(() => {
  const r = window.e2e?.room, h = r?.room?.holdem;
  return r ? { status: r.status, code: r.room?.code, playerId: r.playerId, hostId: r.room?.hostId, funded: r.room?.fundedPlayers, lobby: !!r.room && !h,
    hand: h ? { id: h.id, number: h.number, revision: h.revision, street: h.street, actorId: h.actorId, legal: h.legal, board: h.board.length,
      runout: h.runout ? { phase: h.runout.phase, playerId: h.runout.playerId } : null } : null } : null;
});

async function act(page, kind) {
  if (kind === 'raise' || kind === 'allIn') {
    await page.getByRole('button', { name: '레이즈 금액 선택' }).click();
    if (kind === 'raise') await page.getByRole('button', { name: '레이즈', exact: true }).last().click();
    else { await page.getByRole('button', { name: '올인', exact: true }).last().click(); await page.getByRole('button', { name: '올인', exact: true }).last().click(); }
    return;
  }
  await page.getByRole('button', { name: kind === 'fold' ? /^폴드/ : /^(체크|콜)/ }).click();
}

// Same-device deltas only: every client value is that page's performance.now(); the server is separate.
function summarize(report) {
  const q = xs => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const p = f => v[Math.min(v.length - 1, Math.floor(f * v.length))];
    return { n: v.length, p50: +p(.5).toFixed(1), p90: +p(.9).toFixed(1), max: +v[v.length - 1].toFixed(1) }; };
  const ACTIONS = ['check', 'call', 'bet', 'raise', 'fold', 'allIn'], soundOf = ref => report.hands[ref]?.sound ? 'on' : 'off';
  const m = { on: {}, off: {} }, add = (md, k, v) => (m[md][k] ??= []).push(v), outcomes = {};
  let actionStarts = 0, outOfSync = 0; const results = {};
  for (const c of report.clients) {
    const E = c.timing, receipts = E.filter(e => e.event === 'client_room_received' && e.baseline !== 'duplicate');
    for (const e of E.filter(e => e.event === 'client_card_reveal' && e.kind === 'board' && e.animated)) {
      const md = soundOf(e.handRef); add(md, 'stateToReveal', e.sinceReceiptMs);
      const f = E.find(x => x.event === 'client_board_frame' && x.handRef === e.handRef && x.revision === e.revision); if (f) add(md, 'stateToFrame', f.sinceReceiptMs);
      const snd = E.find(x => x.event === 'client_audio_started' && /Reveal$/.test(x.sound) && x.handRef === e.handRef && x.revision === e.revision);
      if (snd) add(md, 'revealToRevealSound', snd.monoMs - e.monoMs);
    }
    for (const d of c.dom.filter(d => d.faces > 0)) {
      const rec = receipts.filter(x => x.boardCount === d.faces && x.monoMs <= d.domAt).at(-1);
      if (rec) { add(soundOf(rec.handRef), 'stateToDomCommit', d.domAt - rec.monoMs); add(soundOf(rec.handRef), 'stateToDomFrame', d.frameAt - rec.monoMs); }
    }
    for (const e of E) {
      if (e.event === 'client_audio_started' && ACTIONS.includes(e.sound)) { actionStarts++; add(soundOf(e.handRef), 'stateToActionSound', e.sinceReceiptMs);
        if (receipts.some(x => x.handRef === e.handRef && x.revision > e.revision && x.monoMs <= e.monoMs)) outOfSync++; }
      if (e.event === 'client_audio_started' && ['potCollect', 'victory', 'shuffle'].includes(e.sound)) (results[c.user + e.handRef] ??= []).push([e.monoMs, e.sound]);
      if (e.event === 'client_audio_finished' || e.event === 'client_audio_dropped') { const k = `${soundOf(e.handRef)}:${e.sound}:${e.outcome ?? 'dropped_' + e.reason}`; outcomes[k] = (outcomes[k] ?? 0) + 1; }
    }
  }
  const order = Object.values(results).map(l => l.sort((a, b) => a[0] - b[0]).map(x => x[1]));
  const ordered = order.filter(seq => seq.join() === ['potCollect', 'victory', 'shuffle'].filter(x => seq.includes(x)).join()).length;
  const stat = md => Object.fromEntries(Object.entries(m[md]).map(([k, v]) => [k, q(v)]));
  return { sound: { on: stat('on'), off: stat('off') }, actionSounds: { started: actionStarts, startedAfterNewerState: outOfSync },
    resultOrder: `${ordered}/${order.length}`, audioOutcomes: outcomes,
    serverActionToBroadcast: q(report.server.filter(e => e.event === 'game_state_broadcast' && e.cause === 'action').map(e => e.sinceTriggerMs)) };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const js = await bundle();
  const srv = await startServer(js);
  const browsers = [], pages = [], logs = { console: [], pageErrors: [] }, hosts = new Set();
  fs.writeFileSync(path.join(out, 'e2e.js'), js); // For inspection: the exact bundle the browsers ran.
  // Hand plan: sound mode and action policy per hand. Fast = act as soon as the turn appears.
  const plan = { 1: { sound: true, policy: 'fast' }, 2: { sound: true, policy: 'fast' }, 3: { sound: true, policy: 'raise' }, 4: { sound: false, policy: 'fast' },
    5: { sound: false, policy: 'raise' }, 6: { sound: true, policy: 'allIn' }, 7: { sound: false, policy: 'allIn' } };
  const hands = {}; let resets = 0;
  try {
    for (const user of USERS) {
      const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome',
        args: ['--autoplay-policy=no-user-gesture-required'] });
      browsers.push(browser);
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.console.push({ user, type: m.type(), text: m.text().slice(0, 300), url: m.location()?.url ? new URL(m.location().url).pathname : undefined }); });
      page.on('pageerror', e => logs.pageErrors.push({ user, text: String(e.message).slice(0, 300) }));
      // Every network destination (HTTP and WebSocket) is recorded; anything but the local server fails the run.
      page.on('request', req => { const u = new URL(req.url()); if (u.protocol !== 'data:' && u.protocol !== 'blob:') hosts.add(u.host); });
      page.on('websocket', ws => hosts.add(new URL(ws.url()).host));
      page.on('response', res => { if (res.status() >= 400) logs.console.push({ user, type: 'http', text: res.status() + ' ' + new URL(res.url()).pathname }); });
      await page.addInitScript(domObserver);
      await page.goto(`${srv.origin}/?user=${user}`);
      await page.waitForFunction(() => !!window.e2e);
      pages.push(page);
    }
    await pages[0].evaluate(() => window.e2e.enter({ type: 'create', nickname: 'E2E_A', game: 'holdem' }));
    await pages[0].waitForFunction(() => !!window.e2e.room.room?.code);
    const code = (await view(pages[0])).code;
    for (const [i, page] of pages.entries()) if (i) {
      await page.evaluate(([c, n]) => window.e2e.enter({ type: 'join', code: c, nickname: n }), [code, 'E2E_' + USERS[i]]);
      await page.waitForFunction(() => window.e2e.room.status === 'connected' && !!window.e2e.room.room);
    }
    await pages[0].getByRole('button', { name: '홀덤 시작' }).click();
    const deadline = Date.now() + 8 * 60_000, acted = new Set(), squeezed = new Set();
    const completeSince = {};
    let soundOn = true;
    while (Date.now() < deadline) {
      const views = await Promise.all(pages.map(view));
      const host = views[0], hand = host?.hand;
      if (host?.lobby) { // After a reset: start the next match from the real lobby button.
        await pages[0].getByRole('button', { name: '홀덤 시작' }).click().catch(() => {}); await sleep(200); continue;
      }
      if (!hand) { await sleep(25); continue; }
      const step = plan[hand.number] ?? null;
      if (!step) break;
      hands[hand.id.slice(0, 8)] ??= { number: hand.number, sound: step.sound, policy: step.policy };
      if (soundOn !== step.sound) { await Promise.all(pages.map(p => p.evaluate(m => window.e2e.setMuted(m), !step.sound))); soundOn = step.sound; }
      if (hand.street === 'complete') {
        const next = plan[hand.number + 1];
        if (!next) { await sleep(1500); break; }
        completeSince[hand.id] ??= Date.now();
        // Switch sound mode inside the between-hands window, after pot/victory sounds (~1.8s) could play.
        if (next.sound !== soundOn && Date.now() - completeSince[hand.id] > 2500) { await Promise.all(pages.map(p => p.evaluate(m => window.e2e.setMuted(m), !next.sound))); soundOn = next.sound; }
        // After hand 6 the host always resets chips once, so hand 7 starts from the lobby (also covers a busted table).
        if (hand.number === 6 && resets < 1 && Date.now() - completeSince[hand.id] > 3000) { await pages[0].evaluate(() => window.e2e.resetChips()); resets++; }
        await sleep(50); continue;
      }
      for (const [i, v] of views.entries()) {
        const h = v?.hand; if (!h) continue;
        if (h.runout?.phase === 'squeezing' && h.runout.playerId === v.playerId && !squeezed.has(h.id)) {
          squeezed.add(h.id); setTimeout(() => pages[i].evaluate(id => window.e2e.revealRiver(id), h.id).catch(() => {}), 800);
        }
        if (h.actorId !== v.playerId || !h.legal) continue;
        const key = `${h.id}:${h.revision}`; if (acted.has(key)) continue; acted.add(key);
        let kind = h.legal.canCheck ? 'check' : 'call';
        if (step.policy === 'raise' && h.street === 'preflop' && h.legal.canRaise && !acted.has(h.id + ':raised')) { kind = 'raise'; acted.add(h.id + ':raised'); }
        if (step.policy === 'allIn' && h.street === 'preflop' && h.legal.canAllIn && !acted.has(h.id + ':allin')) { kind = 'allIn'; acted.add(h.id + ':allin'); }
        await act(pages[i], kind).catch(e => logs.pageErrors.push({ user: USERS[i], text: 'driver: ' + e.message.slice(0, 200) }));
      }
      await sleep(25);
    }
    const collected = await Promise.all(pages.map(async (p, i) => ({ user: USERS[i], timing: await p.evaluate(() => window.__friendsTableGameTiming?.dump() ?? []), dom: await p.evaluate(() => window.__e2eDom) })));
    const report = { requestHosts: [...hosts], browser: { name: 'chromium', version: browsers[0].version() }, hands, logs, clients: collected, server: srv.serverTiming, finishedAt: new Date().toISOString() };
    report.summary = summarize(report);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report));
    const errors = logs.console.filter(c => c.type === 'error' && c.url !== '/favicon.ico');
    console.log(JSON.stringify({ hands: Object.values(hands).length, browser: report.browser, consoleErrors: errors, pageErrors: logs.pageErrors, summary: report.summary }, null, 1));
    // Pass criteria for this change: full plan played, no page errors, cards never wait for sound.
    const worst = Math.max(report.summary.sound.on.stateToReveal?.max ?? Infinity, report.summary.sound.off.stateToReveal?.max ?? Infinity);
    const failures = [Object.values(hands).length < Object.keys(plan).length && 'plan incomplete', logs.pageErrors.length && 'page errors', errors.length && 'console errors',
      report.summary.actionSounds.startedAfterNewerState && 'action sound after newer state', report.requestHosts.some(h => h !== new URL(srv.origin).host) && 'non-local network request',
      /supabase\.co|railway\.app|pages\.dev/.test(js) && 'remote service URL in E2E bundle', !(worst < 250) && 'card reveal >= 250ms after state'].filter(Boolean);
    if (failures.length) { console.error('E2E FAILED: ' + failures.join(', ')); process.exitCode = 1; } else console.log('E2E PASSED');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    srv.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
