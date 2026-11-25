// LOCAL BROWSER E2E ONLY — seat selection and host approval in real browsers against a local server.
// Same isolation as scripts/test-game-e2e.cjs: 127.0.0.1 server, in-memory lobby, per-run test tokens,
// `authClient`/`serverUrl` replaced only inside this script's esbuild bundle. Screenshots (no card
// values, no tokens) go to .qa-web/seat-e2e/. Usage: node scripts/test-seat-e2e.cjs
// (ESBUILD_PATH / PLAYWRIGHT_PATH / CHROME_PATH optional, as for test-game-e2e.cjs)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.CF_PAGES) throw new Error('Local E2E harness refuses to run in a deployed environment');
const HOST = '127.0.0.1';
const root = path.resolve(__dirname, '..'), out = path.join(root, '.qa-web/seat-e2e');
const load = (env, fallback) => require(process.env[env] ?? path.join(root, '.qa-web/node_modules', fallback));
const { build } = load('ESBUILD_PATH', 'esbuild');
const { chromium } = load('PLAYWRIGHT_PATH', 'playwright');
const USERS = ['A', 'B', 'C', 'D'], NAMES = { A: '방장', B: '민수', C: '지현', D: '서준' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bundle() {
  const fixtures = {
    authClient: `const id = window.__friendsTableE2E;
export const authConfigured = true;
export const authClient = { auth: { getSession: async () => ({ data: { session: id ? { user: { id: id.accountId }, access_token: id.token } : null } }) } };`,
    serverUrl: `export const getServerUrl = () => 'ws://' + location.host + '/lobby';`,
  };
  const result = await build({ entryPoints: [path.join(root, 'apps/mobile/test/browser/game-e2e-fixture.jsx')], bundle: true, write: false,
    plugins: [{ name: 'local-e2e-fixtures', setup(b) {
      b.onResolve({ filter: /\/(authClient|serverUrl)$/ }, args => ({ path: args.path.split('/').pop(), namespace: 'e2e-fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'e2e-fixture' }, ({ path: p }) => ({ contents: fixtures[p], loader: 'js' }));
      b.onLoad({ filter: /\.wav$/ }, args => ({ contents: `module.exports=${JSON.stringify('data:audio/wav;base64,' + fs.readFileSync(args.path).toString('base64'))};`, loader: 'js' }));
      b.onLoad({ filter: /expo-modules-core[\\/]build[\\/]ts-declarations[\\/]global\.js$/ }, () => ({ contents: '', loader: 'js' }));
    } }],
    platform: 'browser', format: 'iife', jsx: 'automatic', banner: { js: 'var process={env:{NODE_ENV:"production"}};' },
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
  const identities = new Map(USERS.map((u, i) => [u, { token: 'e2e-' + crypto.randomBytes(24).toString('hex'), accountId: `00000000-0000-4000-8000-00000000000${i + 1}`, sessionId: `00000000-0000-4000-9000-00000000000${i + 1}` }]));
  // "B2" = the same account as B signing in on another device (new session).
  identities.set('B2', { token: 'e2e-' + crypto.randomBytes(24).toString('hex'), accountId: identities.get('B').accountId, sessionId: '00000000-0000-4000-9000-000000000005' });
  const byToken = new Map([...identities.values()].map(v => [v.token, v]));
  let origin = '';
  const server = createAppServer(() => true, async (request, response) => {
    const url = new URL(request.url, 'http://local');
    if (url.pathname === '/e2e.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); return true; }
    if (url.pathname === '/' && identities.has(url.searchParams.get('user'))) {
      const id = identities.get(url.searchParams.get('user'));
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta charset="utf-8"><title>Seat E2E ${url.searchParams.get('user')}</title><style>html,body,#root{height:100%;margin:0;display:flex;flex-direction:column;background:#101C18}</style>
<script>window.__friendsTableE2E=${JSON.stringify({ accountId: id.accountId, token: id.token })};</script><div id="root"></div><script src="/e2e.js"></script>`);
      return true;
    }
    return false;
  }, []);
  await new Promise(r => server.listen(0, HOST, r));
  origin = `http://${HOST}:${server.address().port}`;
  // Production seat path (no autoSeat). Short next-hand window keeps the run fast.
  const lobby = attachLobby(server, { allowedOrigins: [origin], diagnostic: () => {}, nextHandMs: 3000,
    authorize: async token => { const id = byToken.get(token); return id ? { accountId: id.accountId, sessionId: id.sessionId } : null; } });
  return { origin, close: () => { lobby.close(); server.close(); } };
}

const state = page => page.evaluate(() => {
  const r = window.e2e?.room, room = r?.room, h = room?.holdem;
  return { status: r?.status, playerId: r?.playerId, error: r?.error, hostId: room?.hostId, code: room?.code,
    seats: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, p.seat])),
    stacks: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, p.stack])),
    held: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, p.seatHeldUntil ?? null])),
    standing: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, !!p.standingUp])),
    connected: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, p.connected])),
    pending: Object.fromEntries((room?.players ?? []).map(p => [p.nickname, p.pendingChips ?? 0])),
    rebuys: (room?.rebuyRequests ?? []).map(q => ({ nickname: q.nickname, amount: q.amount, expected: q.expectedStack, id: q.id })),
    rebuyNotice: room?.rebuyNotice ?? null, restore: room?.seatRestore ?? null, requests: (room?.seatRequests ?? []).map(q => ({ nickname: q.nickname, seat: q.seat, id: q.id })),
    notice: room?.seatNotice ?? null, hand: h ? { id: h.id, number: h.number, revision: h.revision, street: h.street, actorId: h.actorId, legal: !!h.legal, players: h.players.map(p => p.nickname), dealt: h.players.filter(p => p.cards?.length === 2).map(p => p.nickname) } : null };
});
const until = async (page, predicate, what, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) { const s = await state(page); if (predicate(s)) return s; if (Date.now() > end) throw new Error('timeout: ' + what + ' ' + JSON.stringify(s)); await sleep(40); }
};
const seatButton = (page, n, label = '빈자리') => page.getByRole('button', { name: new RegExp(`^${n}번 자리 ${label}`) });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const js = await bundle();
  const srv = await startServer(js);
  const browsers = [], pages = {}, logs = { console: [], pageErrors: [] }, hosts = new Set(), checks = [], shots = [];
  const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); if (!ok) throw new Error('check failed: ' + name + ' ' + JSON.stringify(detail ?? '')); };
  const shot = async (user, name, caption) => { const file = `${String(shots.length + 1).padStart(2, '0')}-${name}.png`; await pages[user].screenshot({ path: path.join(out, file) }); shots.push({ file, user, caption }); };
  try {
    for (const user of USERS) {
      const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
      browsers.push(browser);
      const page = await (await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' })).newPage();
      page.on('console', m => { if (m.type() === 'error') logs.console.push({ user, text: m.text().slice(0, 300), url: m.location()?.url ? new URL(m.location().url).pathname : undefined }); });
      page.on('pageerror', e => logs.pageErrors.push({ user, text: String(e.message).slice(0, 300) }));
      page.on('request', req => { const u = new URL(req.url()); if (u.protocol !== 'data:' && u.protocol !== 'blob:') hosts.add(u.host); });
      page.on('websocket', ws => hosts.add(new URL(ws.url()).host));
      await page.goto(`${srv.origin}/?user=${user}`);
      await page.waitForFunction(() => !!window.e2e);
      pages[user] = page;
    }
    const { A, B, C, D } = pages;
    // 1. Host creates the room and is NOT seated automatically; picks seat 1 without approval.
    await A.evaluate(n => window.e2e.enter({ type: 'create', nickname: n, game: 'holdem' }), NAMES.A);
    let a = await until(A, s => !!s.code, 'room created');
    check('host starts unseated', a.seats[NAMES.A] === null, a.seats);
    await shot('A', 'host-empty-seats', '방장 입장 직후: 6개 좌석 모두 빈자리, 방장도 직접 선택');
    await seatButton(A, 1).click();
    a = await until(A, s => s.seats[NAMES.A] === 0, 'host seated');
    check('host seat is immediate (no request)', a.requests.length === 0, a);
    for (const u of ['B', 'C', 'D']) {
      await pages[u].evaluate(([c, n]) => window.e2e.enter({ type: 'join', code: c, nickname: n }), [a.code, NAMES[u]]);
      await until(pages[u], s => s.status === 'connected' && !!s.code, u + ' joined');
    }
    await shot('B', 'guest-joined', '일반 플레이어 입장: 방장은 1번 자리, 나머지 빈자리 선택 가능');
    // 2. Guest request → host sees requester, seat and chips → reject.
    await seatButton(B, 3).click();
    await until(A, s => s.requests.length === 1 && s.requests[0].seat === 2, 'host sees B request');
    await shot('B', 'guest-pending', '민수: 3번 자리 요청 후 방장 승인 대기');
    await shot('A', 'host-request', '방장 화면: 요청자·좌석 번호·보유 칩과 승인/거절 버튼');
    await A.getByRole('button', { name: '거절', exact: true }).click();
    const rejected = await until(B, s => s.notice?.approved === false, 'B rejected');
    check('rejection releases the seat', rejected.requests.length === 0 && rejected.seats[NAMES.B] === null, rejected);
    await shot('B', 'guest-rejected', '거절 후: 요청 해제, 거절 안내 표시');
    // 3. Same seat at the same time from two browsers → exactly one pending.
    // Fire both requests in the same tick (the command the seat button sends): a UI click race cannot
    // be forced, because the first reservation disables the seat on the other screen immediately.
    await Promise.all([B, C].map(p => p.evaluate(() => window.e2e.room.requestSeat(3))));
    a = await until(A, s => s.requests.length === 1, 'one pending after race');
    await sleep(300);
    a = await state(A);
    const winner = a.requests[0].nickname, loserPage = winner === NAMES.B ? C : B;
    const loser = await until(loserPage, s => !!s.error, 'loser sees error');
    check('simultaneous request: one pending, other refused', a.requests.length === 1 && /요청한 자리|앉은 자리/.test(loser.error), { winner, error: loser.error });
    check('reserved seat is disabled on the other screen', await seatButton(loserPage, 4, `${winner} 요청 중`).isDisabled(), winner);
    await shot(winner === NAMES.B ? 'C' : 'B', 'race-loser', '같은 4번 자리 동시 요청: 늦은 쪽은 거부 안내, 자리는 요청 중으로 잠김');
    await A.getByRole('button', { name: '승인', exact: true }).click();
    await until(A, s => s.seats[winner] === 3, 'race winner approved');
    await seatButton(loserPage, 5).click();
    await until(A, s => s.requests.length === 1, 'loser re-request');
    await A.getByRole('button', { name: '승인', exact: true }).click();
    a = await until(A, s => s.seats[NAMES.B] !== null && s.seats[NAMES.C] !== null, 'B and C seated');
    await shot('A', 'host-three-seated', '방장 화면: 승인된 3명 착석');
    // 4. Refresh while waiting: D requests, then D and the host both reload.
    await seatButton(D, 6).click();
    await until(A, s => s.requests.some(q => q.nickname === NAMES.D), 'D request');
    await D.reload(); await D.waitForFunction(() => !!window.e2e);
    const dBack = await until(D, s => s.status === 'connected' && s.requests.some(q => q.nickname === NAMES.D && q.seat === 5), 'D pending after reload');
    check('pending request restored after guest refresh', dBack.seats[NAMES.D] === null, dBack);
    await A.reload(); await A.waitForFunction(() => !!window.e2e);
    a = await until(A, s => s.status === 'connected' && s.requests.length === 1, 'host sees request after reload');
    check('host still sees request after host refresh', a.requests[0].nickname === NAMES.D, a);
    await shot('D', 'guest-pending-after-reload', '서준: 새로고침 후에도 6번 자리 승인 대기 상태 유지');
    // 5. Start the game with 3 seated players; approve D mid-hand → D joins from the next hand.
    await A.getByRole('button', { name: '홀덤 시작' }).click();
    let hand = (await until(A, s => !!s.hand, 'hand 1')).hand;
    check('pending player not dealt into hand 1', !hand.players.includes(NAMES.D), hand.players);
    await until(D, s => !!s.hand, 'D sees game');
    await shot('A', 'game-host-approval', '게임 중 방장 화면: 하단에 대기 중인 착석 요청');
    await shot('D', 'game-spectator-pending', '게임 중 대기자 화면: 승인되면 다음 판부터 참여 안내');
    await A.getByRole('button', { name: '승인', exact: true }).click();
    const during = await until(D, s => s.seats[NAMES.D] === 5, 'D approved mid-hand');
    check('approval mid-hand does not change the running hand', during.hand?.id === hand.id && !during.hand.players.includes(NAMES.D), during.hand);
    // Fold everyone out of hand 1 through the real buttons.
    for (let guard = 0; guard < 40; guard++) {
      const s = await state(A);
      if (s.hand?.street === 'complete' || (s.hand && s.hand.id !== hand.id)) break;
      for (const u of USERS) { const v = await state(pages[u]); if (v.hand?.legal && v.hand.actorId === v.playerId) await pages[u].getByRole('button', { name: /^폴드/ }).click().catch(() => {}); }
      await sleep(150);
    }
    const next = await until(D, s => s.hand && s.hand.number === 2, 'hand 2', 15000);
    check('approved player is dealt into the next hand', next.hand.players.includes(NAMES.D) && next.hand.dealt.includes(NAMES.D), next.hand);
    await shot('D', 'next-hand-dealt', '다음 판: 승인된 서준이 카드를 받고 참여');
    // 6. FT-FEAT-003: C's page goes away mid-hand → seat held (server clock), back within the hold → same seat, no approval.
    const cUrl = C.url();
    await C.goto('about:blank');
    const away = await until(A, s => s.connected[NAMES.C] === false, 'C disconnected');
    check('disconnected seat is held, not released', away.seats[NAMES.C] !== null && away.held[NAMES.C] > Date.now() + 170000, { seat: away.seats[NAMES.C], held: away.held[NAMES.C] });
    await C.goto(cUrl); await C.waitForFunction(() => !!window.e2e);
    const cBack = await until(C, s => s.status === 'connected' && s.connected[NAMES.C] === true, 'C back');
    check('reconnect within the hold restores seat and chips without approval', cBack.seats[NAMES.C] === away.seats[NAMES.C] && cBack.stacks[NAMES.C] === away.stacks[NAMES.C] && cBack.requests.length === 0 && cBack.held[NAMES.C] === null, cBack);
    // 7. FT-FEAT-004: B stands up with the real button during hand 2 → seat kept until the hand ends, then spectator with chips.
    hand = (await state(A)).hand;
    await B.getByRole('button', { name: '자리에서 일어나기' }).click();
    const marked = await until(A, s => s.standing[NAMES.B], 'B standing up');
    check('stand-up waits for the running hand', marked.seats[NAMES.B] !== null && marked.hand?.id === hand.id, { seat: marked.seats[NAMES.B], hand: marked.hand?.id === hand.id });
    await shot('B', 'stand-up-pending', '게임 중 일어나기: 이번 판이 끝나면 자리 해제, 칩은 보관 안내');
    for (let guard = 0; guard < 40; guard++) {
      const s = await state(A);
      if (s.hand?.street === 'complete' || (s.hand && s.hand.id !== hand.id)) break;
      for (const u of USERS) { const v = await state(pages[u]); if (v.hand?.legal && v.hand.actorId === v.playerId) await pages[u].getByRole('button', { name: /^폴드/ }).click().catch(() => {}); }
      await sleep(150);
    }
    const stood = await until(B, s => s.seats[NAMES.B] === null, 'B released after hand 2');
    const settledStack = stood.stacks[NAMES.B];
    check('released after the hand with the settled balance', Number.isSafeInteger(settledStack) && settledStack > 0 && !stood.standing[NAMES.B], { stack: settledStack });
    const third = await until(A, s => s.hand && s.hand.number === 3, 'hand 3', 15000);
    check('spectator is not dealt into the next hand', !third.hand.players.includes(NAMES.B) && third.stacks[NAMES.B] === settledStack, third.hand.players);
    await shot('B', 'spectator-balance', '관전자: 보유 칩 표시, 빈자리를 눌러 재착석 요청');
    await seatButton(B, 2).click();
    const resit = await until(A, s => s.requests.some(q => q.nickname === NAMES.B), 'B re-seat request');
    check('re-seat needs host approval again', resit.seats[NAMES.B] === null, resit.requests);
    await A.getByRole('button', { name: '승인', exact: true }).click();
    const reseated = await until(B, s => s.seats[NAMES.B] === 1, 'B re-seated');
    check('approval keeps the balance (no chips granted)', reseated.stacks[NAMES.B] === settledStack && !(reseated.hand?.players ?? []).includes(NAMES.B), { stack: reseated.stacks[NAMES.B] });
    // 8. FT-FEAT-005: rebuy through the real form while dealt in → held until the hand ends, then added once.
    const playHand = async (handId, action = /^폴드/) => {
      for (let guard = 0; guard < 60; guard++) {
        const s = await state(A);
        if (!s.hand || s.hand.id !== handId || s.hand.street === 'complete') return;
        for (const u of USERS) { const v = await state(pages[u]).catch(() => null); if (v?.hand?.legal && v.hand.actorId === v.playerId) await pages[u].getByRole('button', { name: action }).first().click().catch(() => {}); }
        await sleep(150);
      }
    };
    const sum = s => Object.values(s.stacks).reduce((a, b) => a + (b ?? 0), 0);
    let cur = await until(A, s => s.hand && s.hand.street !== 'complete' && s.hand.players.includes(NAMES.C), 'a hand with C dealt in', 20000);
    const rebuyHand = cur.hand.id;
    await C.getByRole('button', { name: '칩 추가 요청' }).click();
    await C.getByLabel('추가 요청 칩').fill('500');
    await sleep(600); // let the modal fade-in finish before the screenshot
    await shot('C', 'rebuy-form', '칩 추가 요청 입력: 보유 칩·추가 요청 칩·승인 후 예상 칩');
    await C.getByRole('button', { name: '요청 보내기' }).click();
    const asked = await until(A, s => s.rebuys.length === 1, 'host sees rebuy');
    check('host sees requester, amount and expected balance', asked.rebuys[0].nickname === NAMES.C && asked.rebuys[0].amount === 500 && asked.rebuys[0].expected === asked.stacks[NAMES.C] + 500, asked.rebuys);
    await shot('A', 'rebuy-host-approval', '방장 화면: 요청자·보유 칩·요청 수량·승인 후 예상 칩, 승인/거절');
    const stackBefore = asked.stacks[NAMES.C];
    await A.getByRole('button', { name: '칩 지급 승인' }).click();
    const held = await until(C, s => s.rebuyNotice?.approved === true, 'C approved');
    if (held.hand?.id === rebuyHand && held.hand.street !== 'complete') {
      check('grant held while dealt into the running hand', held.pending[NAMES.C] === 500 && held.stacks[NAMES.C] === stackBefore, { pending: held.pending[NAMES.C], stack: held.stacks[NAMES.C] });
      await shot('C', 'rebuy-held', '게임 중 승인: 이번 판이 끝나면 반영 안내');
    }
    await A.getByRole('button', { name: '칩 지급 승인' }).click({ timeout: 500 }).catch(() => {}); // a stale second tap does nothing
    await playHand(rebuyHand);
    const applied = await until(C, s => s.pending[NAMES.C] === 0 && s.rebuyNotice?.applied, 'grant applied after the hand', 15000);
    const grants = 500;
    await until(A, s => s.hand && s.hand.id !== rebuyHand, 'next hand after rebuy', 15000);
    const afterRebuy = await until(A, s => !!s.hand && s.hand.street !== 'complete', 'state with hand', 5000);
    const potNow = await A.evaluate(() => window.e2e.room.room.holdem?.pot ?? 0);
    check('chips total = start + grants, granted once', sum(afterRebuy) + potNow === 4000 + grants, { sum: sum(afterRebuy), pot: potNow });
    // Rejected request leaves chips unchanged.
    await D.getByRole('button', { name: '칩 추가 요청' }).click();
    await D.getByLabel('추가 요청 칩').fill('100');
    await D.getByRole('button', { name: '요청 보내기' }).click();
    await until(A, s => s.rebuys.length === 1, 'host sees D rebuy');
    const dStack = (await state(D)).stacks[NAMES.D];
    await A.getByRole('button', { name: '거절', exact: true }).last().click();
    const rej = await until(D, s => s.rebuyNotice?.approved === false, 'D rejected');
    check('rejected rebuy keeps chips', rej.pending[NAMES.D] === 0 && (rej.stacks[NAMES.D] === dStack || rej.hand?.players.includes(NAMES.D)), { stack: rej.stacks[NAMES.D], before: dStack });
    await shot('D', 'rebuy-rejected', '칩 추가 거절 안내: 보유 칩 그대로');
    void applied;
    // 9. FT-FEAT-003: the same account on another device takes the seat back; the old tab is signed out.
    const bBefore = await state(B);
    const b2Browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
    browsers.push(b2Browser);
    const B2 = await (await b2Browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' })).newPage();
    B2.on('pageerror', e => logs.pageErrors.push({ user: 'B2', text: String(e.message).slice(0, 300) }));
    B2.on('websocket', ws => hosts.add(new URL(ws.url()).host));
    await B2.goto(`${srv.origin}/?user=B2`);
    await B2.waitForFunction(() => !!window.e2e);
    const b2 = await until(B2, s => s.status === 'connected' && s.playerId === bBefore.playerId, 'B on the second device', 10000);
    check('other device restores the same seat and chips without approval', b2.seats[NAMES.B] === bBefore.seats[NAMES.B] && b2.requests.length === 0 && !!b2.restore, { seat: b2.seats[NAMES.B], restore: b2.restore });
    const oldTab = await until(B, s => s.status === 'error', 'old tab signed out');
    check('previous session loses control (4003)', /다른 기기/.test(oldTab.error ?? ''), oldTab.error);
    await B2.screenshot({ path: path.join(out, `${String(shots.length + 1).padStart(2, '0')}-other-device-restored.png`) });
    shots.push({ file: `${String(shots.length + 1).padStart(2, '0')}-other-device-restored.png`, user: 'B2', caption: '다른 기기 재접속: 같은 자리·칩 복구 안내' });
    pages.B = B2; // B now plays from the second device
    // 10. FT-BUG-004: a closed connection on turn is played after a 2 s grace (not after the 30 s timer).
    cur = await until(A, s => s.hand && s.hand.street !== 'complete' && [NAMES.C, NAMES.D].some(n => s.hand.actorId && s.hand.players.includes(n)), 'a running hand', 20000);
    let target = null, t0 = 0, rev = 0;
    for (let guard = 0; guard < 100 && !target; guard++) {
      const s = await state(A);
      for (const u of ['C', 'D']) { const v = await state(pages[u]); if (v.hand?.legal && v.hand.actorId === v.playerId) { target = u; rev = s.hand.revision; } }
      if (!target) {
        for (const u of ['A', 'B']) { const v = await state(pages[u]); if (v.hand?.legal && v.hand.actorId === v.playerId) await pages[u].getByRole('button', { name: /^(체크|콜)/ }).first().click().catch(() => {}); }
        await sleep(150);
      }
    }
    check('found a turn for C or D', !!target, null);
    const backUrl = pages[target].url();
    t0 = Date.now();
    await pages[target].goto('about:blank');
    const moved = await until(A, s => !s.hand || s.hand.revision > rev || s.hand.street === 'complete', 'turn auto-played', 8000);
    const took = Date.now() - t0;
    check('disconnected player on turn is checked/folded after the 2 s grace', took >= 1900 && took < 4500, { took, actorWas: NAMES[target], revision: moved.hand?.revision });
    await pages[target].goto(backUrl); await pages[target].waitForFunction(() => !!window.e2e);
    const backAgain = await until(pages[target], s => s.status === 'connected', 'back after auto-play');
    check('reconnect after auto-play keeps the seat', backAgain.seats[NAMES[target]] !== null, backAgain.seats);
    // 11. Host's own rebuy through the real form: no approval, never listed for others.
    const hostBefore = await state(A);
    await A.getByRole('button', { name: '칩 추가', exact: true }).click();
    await A.getByLabel('추가 요청 칩').fill('300');
    await sleep(600);
    await shot('A', 'host-rebuy-form', '방장 칩 추가: 승인 없이 바로 추가(게임 중이면 판 종료 후)');
    await A.getByRole('button', { name: '칩 추가하기' }).click();
    const hostAfter = await until(A, s => s.rebuyNotice?.approved === true && s.rebuyNotice.amount === 300, 'host rebuy recorded');
    const others = await state(pages.C);
    check('host rebuy needs no approval and is not listed for others', others.rebuys.length === 0 && hostAfter.rebuys.length === 0
      && (hostAfter.pending[NAMES.A] === 300 || hostAfter.stacks[NAMES.A] >= hostBefore.stacks[NAMES.A] + 300 - 20), { pending: hostAfter.pending[NAMES.A], stack: hostAfter.stacks[NAMES.A], before: hostBefore.stacks[NAMES.A] });
    const errors = logs.console.filter(c => c.url !== '/favicon.ico');
    check('no page or console errors', !logs.pageErrors.length && !errors.length, { pageErrors: logs.pageErrors, errors });
    check('only the local server was contacted', [...hosts].every(h => h === new URL(srv.origin).host), [...hosts]);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, shots, browser: browsers[0].version(), finishedAt: new Date().toISOString() }, null, 1));
    console.log(JSON.stringify({ checks: checks.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}`), shots: shots.map(s => s.file) }, null, 1));
    console.log('SEAT E2E PASSED');
  } catch (error) {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, shots, error: String(error), logs }, null, 1));
    console.error('SEAT E2E FAILED:', error.message, JSON.stringify({ checks, logs }).slice(0, 2000));
    process.exitCode = 1;
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    srv.close();
  }
})();
