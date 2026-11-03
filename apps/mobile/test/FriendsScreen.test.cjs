const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.FRIENDS_PROJECT_ROOT || path.resolve(__dirname, '../../..');
const ts = require(require.resolve('typescript', { paths: [root] }));

// Execute the real JSX with native host stubs; enforce RN's raw-text invariant.
function harness(rows, { loading = false, message = '', height = 800 } = {}) {
  const slots = [];
  let cursor = 0;
  const calls = [];
  const state = { rows, loading, message, busy: false, refresh() {}, request() {}, remove() {},
    respond: (...args) => calls.push(args) };
  const jsx = (type, props) => ({ type, props: props || {} });
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'View'].map(x => [x, x]));
  Object.assign(native, { StyleSheet: { create: x => x }, Platform: { OS: 'android' },
    useWindowDimensions: () => ({ height }), Alert: { alert() {} }, Share: { share: async () => {} } });
  function compile(file, imports) {
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react-native') return native;
      if (id in imports) return imports[id];
      throw Error(`Unexpected import: ${id}`);
    } }, { filename: file });
    return exports;
  }
  const { ActionButton } = compile(path.join(root, 'apps/mobile/src/components/ActionButton.tsx'), {});
  const { FriendsScreen } = compile(process.env.FRIENDS_SCREEN_SOURCE || path.join(root, 'apps/mobile/src/screens/FriendsScreen.tsx'), {
    react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../hooks/useFriends': { useFriends: () => state },
    '../services/friendTypes': { normalizeFriendCode: x => x },
    '../components/ActionButton': { ActionButton },
    './FriendStatsScreen': { FriendStatsScreen: () => null },
  });
  let nodes;
  function render() {
    cursor = 0; nodes = [];
    function visit(node, parent) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => visit(child, parent));
      if (typeof node === 'string' || typeof node === 'number') {
        assert.equal(parent, 'Text', `Raw text ${JSON.stringify(node)} beneath ${parent}`);
        return;
      }
      if (typeof node.type === 'function') return visit(node.type(node.props), parent);
      nodes.push(node);
      visit(node.props.children, node.type === 'Fragment' ? parent : node.type);
    }
    visit(FriendsScreen({ profile: { id: 'me', friend_code: 'AAAAAAAAAAAA' }, onClose() {} }));
    return nodes;
  }
  function select(index) { nodes.filter(n => n.props.accessibilityRole === 'tab')[index].props.onPress(); render(); }
  function labels() { return nodes.filter(n => n.type === 'Text').map(n => n.props.children).flat().join('|'); }
  function press(label) {
    const button = nodes.find(n => n.type === 'Pressable' && n.props.children?.type === 'Text' && n.props.children.props.children === label);
    assert.ok(button, `Missing button ${label}`); button.props.onPress();
  }
  return { render, select, labels, press, calls };
}
const row = (status, incoming, display_name = '친구') => ({ id: 'request-1', other_id: 'friend-1', status, incoming, display_name });

test('empty lists and zero tab counts contain no raw text', () => {
  const h = harness([]); h.render();
  assert.match(h.labels(), /아직 친구가 없어요/);
  h.select(1); assert.match(h.labels(), /받은 요청이 없어요/);
  h.select(2); assert.match(h.labels(), /보낸 요청이 없어요/);
});
test('incoming requests render accept/reject and preserve handlers', () => {
  const h = harness([row('pending', true)]); h.render(); h.select(1);
  h.press('수락'); h.press('거절');
  assert.deepEqual(h.calls, [['request-1', true], ['request-1', false]]);
});
test('outgoing requests render cancellation', () => {
  const h = harness([row('pending', false)]); h.render(); h.select(2);
  assert.match(h.labels(), /취소/); assert.doesNotMatch(h.labels(), /전적/);
});
test('accepted friends render stats and deletion, including empty and zero-like names', () => {
  for (const name of ['친구', '', '0']) {
    const h = harness([row('accepted', false, name)]); h.render();
    assert.match(h.labels(), /전적/); assert.match(h.labels(), /삭제/);
  }
});
test('loading, alerts, and pagination remain text-safe', () => {
  harness([], { loading: true }).render();
  for (const message of ['', '0', '완료']) harness([], { message }).render();
  const h = harness(Array.from({ length: 3 }, (_, i) => ({ ...row('accepted', false, `이름${i}`), id: `id${i}` })), { height: 600 });
  h.render(); assert.doesNotMatch(h.labels(), /이름2/);
  h.press('다음'); h.render(); assert.match(h.labels(), /이름2/);
});
