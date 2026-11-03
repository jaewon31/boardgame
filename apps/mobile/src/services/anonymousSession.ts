// Structural boundary keeps account lifecycle independent of provider SDK/UI details.
interface SessionIdentity {user:{id:string}}
interface Auth<S extends SessionIdentity> {
 getSession():Promise<{data:{session:S|null};error:unknown}>;
 signInAnonymously():Promise<{data:{session:S|null};error:unknown}>;
}
// Shared across hook remounts/Strict Mode; a concurrent launch must not create two users.
const pending = new WeakMap<object, Promise<unknown>>();
interface IdentityStorage {getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>}
const identityKey='friends-table-account-id';
export function ensureAccountSession<S extends SessionIdentity>(auth: Auth<S>, storage:IdentityStorage): Promise<S> {
  const existing = pending.get(auth);
  if (existing) return existing as Promise<S>;
  const task = (async () => {
    const restored = await auth.getSession();
    if (restored.error) throw restored.error;
    if (restored.data.session) {
      await storage.setItem(identityKey,restored.data.session.user.id);
      return restored.data.session;
    }
    // A cleared/expired refresh token is not consent to discard a known account.
    if(await storage.getItem(identityKey))throw {code:'saved_account_unavailable'};
    const created = await auth.signInAnonymously();
    if (created.error) throw created.error;
    if (!created.data.session) throw new Error('No account session returned');
    await storage.setItem(identityKey,created.data.session.user.id);
    return created.data.session;
  })();
  pending.set(auth, task);
  void task.finally(() => pending.delete(auth)).catch(() => {});
  return task;
}
