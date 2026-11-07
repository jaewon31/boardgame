import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ensureAccountSession } from '../../mobile/src/services/anonymousSession.ts';
import { authStorage } from '../../mobile/src/services/authStorage.ts';

test('two installations use separate auth storage and pending requests; relaunch preserves each UUID', async () => {
  const installation = () => {
    const data = new Map<string,string>();
    const storage = authStorage({
      getItemAsync: async key => data.get(key) ?? null,
      setItemAsync: async (key, value) => { data.set(key, value); },
      deleteItemAsync: async key => { data.delete(key); },
    });
    let calls = 0;
    const provider = () => ({
      getSession: async () => ({data:{session: JSON.parse(await storage.getItem('supabase-session') ?? 'null') as {user:{id:string}} | null}, error:null}),
      signInAnonymously: async () => {
        calls++;
        const session = {user:{id:randomUUID()}};
        await storage.setItem('supabase-session', JSON.stringify(session));
        return {data:{session}, error:null};
      },
    });
    return {storage, provider, get calls() { return calls; }};
  };
  const a = installation(), b = installation(), authA = a.provider(), authB = b.provider();
  const [first, second, duplicate] = await Promise.all([
    ensureAccountSession(authA, a.storage), ensureAccountSession(authB, b.storage), ensureAccountSession(authA, a.storage),
  ]);
  assert.notEqual(first.user.id, second.user.id);
  assert.equal(first.user.id, duplicate.user.id);
  assert.equal(a.calls, 1); assert.equal(b.calls, 1);
  assert.equal((await ensureAccountSession(a.provider(), a.storage)).user.id, first.user.id);
  assert.equal((await ensureAccountSession(b.provider(), b.storage)).user.id, second.user.id);
  assert.equal(a.calls, 1); assert.equal(b.calls, 1);
});
