const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const jsx = (type, props) => ({ type, props: props || {} });
function compile(file, imports) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id in imports) return imports[id];
    throw Error(`Unexpected import: ${id}`);
  } });
  return exports;
}
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x } };
const ActionButton = props => jsx('ActionButton', props);
const { SeatPanel, seatsOf, mySeat, showGameSeatPanel } = compile('apps/mobile/src/components/SeatPanel.tsx', {
  'react-native': native, './ActionButton': { ActionButton },
});
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props.children) : String(node);
function render(room, playerId, connected = true) {
  const calls = [], nodes = [];
  const visit = node => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    if (typeof node.type === 'function') return visit(node.type(node.props));
    visit(node.props.children);
  };
  visit(SeatPanel({ room, playerId, connected, onRequest: s => calls.push(['request', s]), onCancel: () => calls.push(['cancel']), onResolve: (id, ok) => calls.push(['resolve', id, ok]), onStandUp: () => calls.push(['stand']) }));
  const seat = n => nodes.find(x => x.type === 'Pressable' && String(x.props.accessibilityLabel).startsWith(`${n}번 자리`));
  const button = title => nodes.find(x => x.type === 'ActionButton' && x.props.title === title);
  return { calls, nodes, seat, button, all: nodes.map(text).join('\n') };
}
const base = (extra = {}) => ({ code: 'ABCDEFGH', game: 'holdem', hostId: 'h', maxPlayers: 6, seatRequests: [], seatNotice: null,
  players: [{ id: 'h', nickname: '방장', connected: true, seat: 0 }, { id: 'g', nickname: '친구', connected: true, seat: null }], ...extra });

test('six fixed seats; an unseated guest can request an empty seat but not an occupied one', () => {
  const view = render(base(), 'g');
  assert.equal(seatsOf(base()).length, 6);
  assert.equal(view.seat(1).props.disabled, true, 'host seat');
  assert.match(view.seat(1).props.accessibilityLabel, /방장/);
  assert.equal(view.seat(4).props.disabled, false);
  view.seat(4).props.onPress();
  assert.deepEqual(view.calls, [['request', 3]], 'seat 4 is index 3');
  assert.match(view.all, /방장에게 착석을 요청/);
  assert.equal(render(base(), 'g', false).seat(4).props.disabled, true, 'offline cannot request');
});

test('the host starts unseated too and picks any seat directly', () => {
  const room = base({ players: [{ id: 'h', nickname: '방장', connected: true, seat: null }, { id: 'g', nickname: '친구', connected: true, seat: null }] });
  const view = render(room, 'h');
  assert.match(view.all, /빈자리를 누르면 바로 앉아요/);
  assert.equal(mySeat(room, 'h'), null);
  for (let n = 1; n <= 6; n++) assert.equal(view.seat(n).props.disabled, false);
  view.seat(1).props.onPress();
  assert.deepEqual(view.calls, [['request', 0]]);
});

test('pending request reserves the seat, shows waiting state and can be cancelled', () => {
  const room = base({ seatRequests: [{ id: 'r1', playerId: 'g', nickname: '친구', seat: 2, kind: 'sit', stack: 1000, requestedAt: 1 }] });
  const view = render(room, 'g');
  assert.match(view.all, /3번 자리 · 방장 승인 대기 중/);
  assert.equal(view.seat(3).props.disabled, true);
  assert.equal(view.seat(5).props.disabled, true, 'no second request while pending');
  view.button('착석 요청 취소').props.onPress();
  assert.deepEqual(view.calls, [['cancel']]);
  assert.equal(render(room, 'g').nodes.some(n => n.props?.testID === 'seat-request'), false, 'only the host gets approve/reject');
});

test('host sees requester, seat and chip balance and can approve or reject', () => {
  const room = base({ seatRequests: [{ id: 'r1', playerId: 'g', nickname: '친구', seat: 2, kind: 'resit', stack: 1250, requestedAt: 1 }] });
  const view = render(room, 'h');
  assert.match(view.all, /친구 · 3번 자리 · 재착석 · 보유 1,250칩/);
  view.button('승인').props.onPress(); view.button('거절').props.onPress();
  assert.deepEqual(view.calls, [['resolve', 'r1', true], ['resolve', 'r1', false]]);
});

test('rejection notice, in-hand hint, seated players and legacy servers', () => {
  assert.match(render(base({ seatNotice: { requestId: 'r', seat: 1, approved: false, at: 1 } }), 'g').all, /2번 자리 요청을 거절/);
  assert.match(render(base({ holdem: { street: 'flop' } }), 'g').all, /다음 판부터 참여/);
  const seated = render(base({ players: [{ id: 'h', nickname: '방장', connected: true, seat: 0 }, { id: 'g', nickname: '친구', connected: true, seat: 5 }] }), 'g');
  assert.equal(seated.seat(2).props.disabled, true, 'a seated player cannot pick another seat');
  // Older server without seat fields: everyone counts as seated, nothing is requestable.
  const legacy = base({ players: [{ id: 'h', nickname: '방장', connected: true }, { id: 'g', nickname: '친구', connected: true }], seatRequests: undefined });
  assert.equal(mySeat(legacy, 'g'), 1);
  assert.equal(render(legacy, 'g').seat(3).props.disabled, true);
});

// FT-FEAT-003/004: stand-up control, kept balance and held-seat display (server-owned state only).
const held = (extra = {}) => base({ players: [
  { id: 'h', nickname: '방장', connected: true, seat: 0, stack: 990, seatHeldUntil: null, standingUp: false },
  { id: 'g', nickname: '친구', connected: true, seat: 1, stack: 1010, seatHeldUntil: null, standingUp: false },
  { id: 'x', nickname: '구경', connected: true, seat: null, stack: 1250, seatHeldUntil: null, standingUp: false }], ...extra });

test('a seated player can stand up; the request only sends a command', () => {
  const view = render(held(), 'g');
  view.button('자리에서 일어나기').props.onPress();
  assert.deepEqual(view.calls, [['stand']]);
  assert.equal(render(held(), 'g', false).button('자리에서 일어나기').props.disabled, true, 'offline cannot stand up');
  assert.equal(showGameSeatPanel(held(), 'g'), true, 'game strip carries the control');
});

test('pending stand-up shows the after-hand notice and the kept balance, without a second button', () => {
  const room = held();
  room.players[1].standingUp = true;
  const view = render(room, 'g');
  assert.match(view.all, /이번 판이 끝나면 자리에서 일어나요\. 보유 1,010칩은 그대로 보관돼요/);
  assert.equal(view.button('자리에서 일어나기'), undefined);
  assert.match(render(room, 'h').seat(2).props.accessibilityLabel, /친구/);
  assert.match(render(room, 'h').all, /이번 판 후 일어남/);
});

test('a spectator sees its kept balance; a disconnected seat shows it is held', () => {
  assert.match(render(held(), 'x').all, /보유 1,250칩 · 빈자리를 눌러 방장에게 착석을 요청하세요/);
  assert.equal(render(held(), 'x').button('자리에서 일어나기'), undefined);
  const away = held();
  Object.assign(away.players[1], { connected: false, seatHeldUntil: Date.now() + 180000 });
  assert.match(render(away, 'h').all, /연결 끊김 · 자리 보존 중/);
});

test('older servers (no stand-up support) show no stand-up control and no game strip for seated guests', () => {
  const view = render(base({ players: [{ id: 'h', nickname: '방장', connected: true, seat: 0 }, { id: 'g', nickname: '친구', connected: true, seat: 1 }] }), 'g');
  assert.equal(view.button('자리에서 일어나기'), undefined);
  assert.equal(showGameSeatPanel(base({ players: [{ id: 'h', nickname: '방장', connected: true, seat: 0 }, { id: 'g', nickname: '친구', connected: true, seat: 1 }] }), 'g'), false);
});

test('reconnect inside the hold shows the restored seat; a seat taken mid-hand shows the next-hand notice', () => {
  const restored = held({ seatRestore: { seat: 1, stack: 1010, at: 1 } });
  assert.match(render(restored, 'g').all, /연결이 복구됐어요\. 2번 자리와 보유 1,010칩을 그대로 이어가요/);
  const midHand = held({ holdem: { street: 'flop', players: [{ id: 'h' }, { id: 'x' }] } });
  assert.match(render(midHand, 'g').all, /2번 자리에 앉았어요\. 다음 판부터 카드를 받아요/);
  assert.doesNotMatch(render(held({ holdem: { street: 'flop', players: [{ id: 'h' }, { id: 'g' }] } }), 'g').all, /다음 판부터 카드/);
});

test('the chip request control shares the stand-up row', () => {
  const view = render({ ...held(), rebuyRequests: [] }, 'g');
  assert.ok(view.button('자리에서 일어나기'));
  const accessory = SeatPanel({ room: { ...held(), rebuyRequests: [] }, playerId: 'g', connected: true, onRequest() {}, onCancel() {}, onResolve() {}, onStandUp() {}, accessory: 'REBUY' });
  assert.match(JSON.stringify(accessory), /REBUY/);
  assert.equal(showGameSeatPanel({ ...base({ players: [{ id: 'h', nickname: '방장', connected: true, seat: 0 }, { id: 'g', nickname: '친구', connected: true, seat: 1 }] }), rebuyRequests: [] }, 'g'), true, 'rebuy-capable server shows the strip');
});
