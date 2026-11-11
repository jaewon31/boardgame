const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const jsx = (type, props) => ({ type, props: props || {} });
const flatStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
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
const betting = compile('apps/mobile/src/services/betting.ts', {});
function harness({ legal = {}, connected = true, error = null } = {}) {
  const states = [], actions = [], alerts = [];
  let cursor = 0, nodes = [];
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'Modal', 'KeyboardAvoidingView'].map(x => [x, x]));
  Object.assign(native, { StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } });
  const hand = { id: 'h', revision: 1, number: 1, street: 'preflop', smallBlind: 10, bigBlind: 20, pot: 30,
    players: [{ id: 'me', nickname: 'ME', roundBet: 10, stack: 990 }], payouts: [], refunds: [], pots: [],
    actorId: 'me', lastEvent: '개인 패를 배분하고 블라인드를 냈습니다.',
    legal: legal === null ? null : { minRaiseTo: 40, maxRaiseTo: 1000, canRaise: true, canAllIn: true, canCheck: false, callAmount: 10, ...legal } };
  const { GameScreen } = compile('apps/mobile/src/screens/GameScreen.tsx', {
    react: { useEffect() {}, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } },
    'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@boardgame/shared': { DEFAULT_SETTINGS: { startingChips: 1000 } }, '../services/betting': betting,
    '../components/SoundSettings': { SoundSettings: 'SoundSettings' }, '../components/HandReview': { HandReviewButton: 'HandReviewButton' },
    '../components/RoomRecords': { RoomRecords: 'RoomRecords' }, '../components/RiverSqueeze': { RiverSqueeze: 'RiverSqueeze' },
    '../components/PokerTable': { PokerTable: 'PokerTable' }, '../components/ActionButton': { ActionButton: 'ActionButton' },
  });
  function render() {
    cursor = 0; nodes = [];
    function visit(node, parent) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(n => visit(n, parent));
      if (typeof node !== 'object') { assert.equal(parent?.type, 'Text', `Raw text: ${node}`); return; }
      if (node.type === 'Modal' && !node.props.visible) return;
      node.parent = parent; nodes.push(node);
      visit(node.props.children, node.type === 'Fragment' ? parent : node);
    }
    visit(GameScreen({ audio: {}, room: { code: 'ABC', holdem: hand }, playerId: 'me', connected, error,
      onAct: (...args) => actions.push(args) }));
    return nodes;
  }
  const text = node => typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props.children) : node ?? '';
  const button = label => nodes.find(n => n.type === 'Pressable' && (n.props.accessibilityLabel || text(n)) === label);
  function press(label) { const n = button(label); assert.ok(n, `Missing ${label}`); if (!n.props.disabled) n.props.onPress(); render(); }
  function input(value) { nodes.find(n => n.type === 'TextInput').props.onChangeText(value); render(); }
  render();
  return { render, press, input, button, actions, alerts, hand, labels: () => nodes.filter(n => n.type === 'Text').map(text).join('|'), nodes: () => nodes };
}
test('repeated game messages disappear while errors remain visible', () => {
  for (const legal of [null, {}]) {
    const h = harness({ legal });
    assert.doesNotMatch(h.labels(), /개인 패를 배분|친구의 행동을 기다리는/);
  }
  const h = harness({ error: '요청을 처리하지 못했어요.' });
  assert.match(h.labels(), /요청을 처리하지 못했어요/);
  h.press('오류 자세히 보기'); assert.equal(h.alerts[0][1], '요청을 처리하지 못했어요.');
});
test('raise panel keeps amount editing and presets, removes explanatory rows, submits total', () => {
  const h = harness(); h.press('레이즈 금액 선택');
  assert.doesNotMatch(h.labels(), /칩 단위 입력|총 베팅|추가|까지 레이즈/);
  h.press('3 BB60');
  assert.equal(h.nodes().find(n => n.type === 'TextInput').props.value, '60');
  h.input('80'); h.press('레이즈');
  assert.deepEqual(h.actions, [['raise', 80]]);
  assert.equal(h.button('올인'), undefined);
});
test('invalid totals cannot raise; boundaries and short-stack maximum remain accepted', () => {
  const h = harness(); h.press('레이즈 금액 선택');
  for (const value of ['', '0', '-1', '39', '1001', '1.5', 'abc']) {
    h.input(value); assert.equal(h.button('레이즈').props.disabled, true); h.press('레이즈');
  }
  assert.deepEqual(h.actions, []);
  for (const value of ['40', '1000']) { h.input(value); assert.equal(h.button('레이즈').props.disabled, false); }
  const short = harness({ legal: { minRaiseTo: 40, maxRaiseTo: 30 } });
  short.press('레이즈 금액 선택'); short.input('30'); assert.equal(short.button('레이즈').props.disabled, false);
});
test('all-in is a separate red row below raise and requires explicit confirmation', () => {
  const h = harness(); h.press('레이즈 금액 선택');
  const raise = h.button('레이즈'), allIn = h.button('올인');
  assert.equal(raise.parent, allIn.parent);
  assert.notEqual(flatStyle(raise.parent.props.style).flexDirection, 'row');
  assert.ok(h.nodes().indexOf(allIn) > h.nodes().indexOf(raise));
  assert.ok(flatStyle(allIn.props.style).marginTop >= 14);
  assert.equal(flatStyle(allIn.props.style).backgroundColor, '#492324');
  h.press('올인'); assert.deepEqual(h.actions, []);
  assert.equal(h.alerts[0][2][0].style, 'cancel');
  assert.equal(h.alerts[0][2][1].style, 'destructive');
  h.alerts[0][2][1].onPress(); h.render();
  assert.deepEqual(h.actions, [['allIn']]); assert.equal(h.button('올인'), undefined);
});
test('all-in-only hands retain access and disconnected actions stay disabled', () => {
  const h = harness({ legal: { canRaise: false } }); h.press('레이즈 금액 선택'); h.input('40');
  assert.equal(h.button('레이즈').props.disabled, true); assert.equal(h.button('올인').props.disabled, false);
  const noAllIn = harness({ legal: { canAllIn: false } }); noAllIn.press('레이즈 금액 선택');
  assert.equal(noAllIn.button('올인').props.disabled, true);
  const disconnected = harness({ connected: false }); disconnected.press('레이즈 금액 선택');
  assert.equal(disconnected.button('올인'), undefined); disconnected.press('폴드'); assert.deepEqual(disconnected.actions, []);
});
test('fold, call and check keep their original actions', () => {
  for (const [label, legal, action] of [['폴드', {}, 'fold'], ['콜10', {}, 'call'], ['체크', { canCheck: true }, 'check']]) {
    const h = harness({ legal }); h.press(label); assert.deepEqual(h.actions, [[action]]);
  }
});

test('pot stays above the board and player/bet/winner labels have no enclosing background', () => {
  const { PokerTable } = compile('apps/mobile/src/components/PokerTable.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x } },
    './WinnerGlow': { WinnerGlow: 'WinnerGlow' }, './PokerCards': { PlayingCard: 'PlayingCard' },
    '../services/betting': betting,
  });
  for (const won of [false, true]) {
    const players = ['me', 'friend'].map(id => ({ id, nickname: id, stack: 950, roundBet: 40, cards: ['14s', '13h'] }));
    const hand = { id: 'h', street: won ? 'complete' : 'flop', players, payouts: won ? [{ playerId: 'friend', amount: 80 }] : [],
      actorId: 'friend', board: ['2s', '3s', '4s'], bigBlind: 20, smallBlind: 10, pot: 80 };
    const nodes = [];
    function walk(node, parent) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(n => walk(n, parent));
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      node.parent = parent; nodes.push(node); walk(node.props.children, node);
    }
    walk(PokerTable({ room: { holdem: hand, players: players.map(p => ({ ...p, connected: true })) }, playerId: 'me',
      seconds: 10, width: 360, height: 600, connected: true }));
    const pot = nodes.find(n => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children[0] === 'POT  ');
    assert.ok(pot);
    const board = pot.parent.props.children[1];
    assert.equal(pot.parent.props.children[0], pot);
    assert.equal(board.props.children.length, 5);
    const name = nodes.find(n => n.type === 'Text' && n.props.children === 'friend');
    const seatHeadStyle = flatStyle(name.parent.parent.props.style);
    assert.equal(seatHeadStyle.backgroundColor, undefined); assert.equal(seatHeadStyle.borderWidth, undefined);
    for (const node of nodes.filter(n => n.type === 'Text')) {
      const style = flatStyle(node.props.style);
      if (style.width === 26) continue; // Only circular initial avatars have a fill.
      assert.equal(style.backgroundColor, undefined); assert.equal(style.borderWidth, undefined);
    }
  }
});
