const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// FT-FEAT-005 rebuy UI: request form, host approval rows, request/decision status. Server state only.
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
const native = { View: 'View', Text: 'Text', TextInput: 'TextInput', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'web' }, StyleSheet: { create: x => x } };
const ActionButton = props => jsx('ActionButton', props);
// Real shared settings helpers (rebuyLimit, defaults) compiled the same way.
const shared = compile('packages/shared/src/settings.ts', {});
const { RebuyPanel, RebuyForm, RebuyButton, parseRebuyAmount, roomRebuyLimit } = compile('apps/mobile/src/components/RebuyPanel.tsx', {
  react: { useState: v => [v, () => {}] }, 'react-native': native, './ActionButton': { ActionButton }, '@boardgame/shared': shared,
});
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props.children) : String(node);
function walk(root) {
  const nodes = [];
  const visit = node => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    if (typeof node.type === 'function') return visit(node.type(node.props));
    visit(node.props.children);
  };
  visit(root);
  return { nodes, all: nodes.map(text).join('\n'), button: title => nodes.find(x => x.type === 'ActionButton' && x.props.title === title) };
}
const room = (extra = {}) => ({ code: 'ABCDEFGH', game: 'holdem', hostId: 'h', maxPlayers: 6, rebuyRequests: [], rebuyNotice: null,
  players: [{ id: 'h', nickname: '방장', connected: true, seat: 0, stack: 990, pendingChips: 0 }, { id: 'g', nickname: '친구', connected: true, seat: 1, stack: 1000, pendingChips: 0 }], ...extra });
const request = { id: 'r1', playerId: 'g', nickname: '친구', amount: 700, stack: 1000, pendingChips: 0, expectedStack: 1700, requestedAt: 1 };

test('amount must be a whole positive number within the limit', () => {
  assert.equal(parseRebuyAmount('700'), 700);
  for (const bad of ['', '0', '-5', '1.5', '1e3', 'abc', '1000000001']) assert.equal(parseRebuyAmount(bad), null, bad);
});

test('request form shows current chips, requested chips and expected balance; submit only when valid', () => {
  const sent = [];
  const form = walk(RebuyForm({ stack: 1000, pending: 200, amount: '500', connected: true, onChange() {}, onSubmit: v => sent.push(v), onClose() {} }));
  assert.match(form.all, /보유 칩/); assert.match(form.all, /1,000 \(\+200 반영 예정\)/);
  assert.match(form.all, /승인 후 예상 칩[\s\S]*1,700/);
  form.button('요청 보내기').props.onPress();
  assert.deepEqual(sent, [500]);
  const bad = walk(RebuyForm({ stack: 1000, pending: 0, amount: '0', connected: true, onChange() {}, onSubmit() {}, onClose() {} }));
  assert.equal(bad.button('요청 보내기').props.disabled, true);
  assert.match(bad.all, /1 이상의 정수/);
  const offline = walk(RebuyForm({ stack: 1000, pending: 0, amount: '10', connected: false, onChange() {}, onSubmit() {}, onClose() {} }));
  assert.equal(offline.button('요청 보내기').props.disabled, true);
  const input = form.nodes.find(n => n.type === 'TextInput');
  assert.equal(input.props.keyboardType, 'number-pad');
  const typed = []; walk(RebuyForm({ stack: 0, pending: 0, amount: '', connected: true, onChange: v => typed.push(v), onSubmit() {}, onClose() {} }))
    .nodes.find(n => n.type === 'TextInput').props.onChangeText('1,2a3');
  assert.deepEqual(typed, ['123'], 'digits only');
});

test('host sees requester, current chips, request and expected chips with approve/reject', () => {
  const calls = [];
  const view = walk(RebuyPanel({ room: room({ rebuyRequests: [request] }), playerId: 'h', connected: true, onCancel() {}, onResolve: (id, ok) => calls.push([id, ok]) }));
  assert.match(view.all, /친구 · 칩 추가 요청/);
  assert.match(view.all, /보유 1,000 · 요청 \+700 · 승인 후 1,700/);
  view.button('칩 지급 승인').props.onPress();
  view.button('거절').props.onPress();
  assert.deepEqual(calls, [['r1', true], ['r1', false]]);
  const guest = walk(RebuyPanel({ room: room({ rebuyRequests: [request] }), playerId: 'g', connected: true, onCancel() {}, onResolve() {} }));
  assert.equal(guest.button('칩 지급 승인'), undefined, 'only the host decides');
});

test('requester sees waiting, applied, held-until-hand-end and rejected states, and can cancel', () => {
  const cancels = [];
  const waiting = walk(RebuyPanel({ room: room({ rebuyRequests: [request] }), playerId: 'g', connected: true, onCancel: () => cancels.push(1), onResolve() {} }));
  assert.match(waiting.all, /칩 추가 \+700 승인 대기 중 · 승인 후 1,700칩/);
  waiting.button('요청 취소').props.onPress();
  assert.equal(cancels.length, 1);
  const held = room(); held.players[1].pendingChips = 700;
  assert.match(walk(RebuyPanel({ room: { ...held, rebuyNotice: { requestId: 'r1', amount: 700, approved: true, applied: false, at: 1 } }, playerId: 'g', connected: true, onCancel() {}, onResolve() {} })).all, /\+700 추가 승인됨 · 이번 판이 끝나면 반영/);
  assert.match(walk(RebuyPanel({ room: room({ rebuyNotice: { requestId: 'r1', amount: 700, approved: true, applied: true, at: 1 } }), playerId: 'g', connected: true, onCancel() {}, onResolve() {} })).all, /\+700 추가 완료/);
  assert.match(walk(RebuyPanel({ room: room({ rebuyNotice: { requestId: 'r1', amount: 700, approved: false, applied: false, at: 1 } }), playerId: 'g', connected: true, onCancel() {}, onResolve() {} })).all, /거절했어요\. 보유 칩은 그대로/);
  assert.equal(RebuyPanel({ room: room(), playerId: 'g', connected: true, onCancel() {}, onResolve() {} }), null, 'idle: nothing');
});

test('request button: hidden while a request is pending and on older servers', () => {
  const visible = RebuyButton({ room: room(), playerId: 'g', connected: true, onRequest() {} });
  assert.ok(visible);
  assert.equal(RebuyButton({ room: room({ rebuyRequests: [request] }), playerId: 'g', connected: true, onRequest() {} }), null);
  const legacy = room(); delete legacy.rebuyRequests;
  assert.equal(RebuyButton({ room: legacy, playerId: 'g', connected: true, onRequest() {} }), null);
  assert.equal(RebuyPanel({ room: legacy, playerId: 'h', connected: true, onCancel() {}, onResolve() {} }), null);
});

// 2026-11-24 23:25 KST: room rebuy limit and the host's own rebuy.
test('room limit: default is the starting chips, the setting overrides it, and the form refuses more', () => {
  assert.equal(roomRebuyLimit(room({ settings: { startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 } })), 1000);
  assert.equal(roomRebuyLimit(room({ settings: { startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30, maxRebuy: 5000 } })), 5000);
  assert.equal(parseRebuyAmount('5000', 5000), 5000);
  assert.equal(parseRebuyAmount('5001', 5000), null);
  const over = walk(RebuyForm({ stack: 1000, pending: 0, amount: '6000', limit: 5000, connected: true, onChange() {}, onSubmit() {}, onClose() {} }));
  assert.equal(over.button('요청 보내기').props.disabled, true);
  assert.match(over.all, /1회 최대 5,000칩까지 요청할 수 있어요/);
  assert.match(over.all, /1회 최대 5,000칩/);
});

test('host form says chips are added without approval', () => {
  const form = walk(RebuyForm({ stack: 990, pending: 0, amount: '300', host: true, limit: 1000, connected: true, onChange() {}, onSubmit() {}, onClose() {} }));
  assert.match(form.all, /^칩 추가$/m);
  assert.match(form.all, /방장은 승인 없이 바로 추가돼요/);
  assert.ok(form.button('칩 추가하기'));
});

test('a request dropped because the limit was lowered says why', () => {
  const view = walk(RebuyPanel({ room: room({ rebuyNotice: { requestId: 'r1', amount: 800, approved: false, applied: false, at: 1, reason: 'limit', limit: 500 } }), playerId: 'g', connected: true, onCancel() {}, onResolve() {} }));
  assert.match(view.all, /리바이 최대 수량이 500칩으로 바뀌어 칩 추가 요청\(\+800\)이 취소됐어요/);
});

test('room settings: fifth step for the rebuy limit, shown in the room summary', () => {
  const { settingsLabel, RoomSettingsEditor } = compile('apps/mobile/src/components/RoomSettingsEditor.tsx', {
    react: { useState: v => [typeof v === 'function' ? v() : v, () => {}], useRef: v => ({ current: v }) },
    'react-native': { ...native, Keyboard: { dismiss() {} }, Pressable: 'Pressable' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@boardgame/shared': shared, './ActionButton': { ActionButton },
  });
  assert.match(settingsLabel({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 }), /리바이 최대 1,000$/);
  assert.match(settingsLabel({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30, maxRebuy: 7000 }), /리바이 최대 7,000$/);
  const editor = walk(RoomSettingsEditor({ initial: { startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 }, onSave() {}, onClose() {} }));
  assert.match(editor.all, /방 설정 · 1\/5/);
  assert.ok(shared.validRoomSettings({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 }), 'older settings without maxRebuy stay valid');
  for (const bad of [0, -1, 1.5, 1_000_000_001]) assert.equal(shared.validRoomSettings({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30, maxRebuy: bad }), false, String(bad));
});
