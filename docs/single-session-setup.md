# One account, one active login

Apply supabase/migrations/003_single_session.sql in the Supabase SQL Editor after 001 and 002. The migration is repeatable and preserves accounts, friendships and game records. It adds an internal session record, restrictive RLS policies and guarded friend RPCs. Do not rerun 002 after 003; rerun 003 if restoring older RPC definitions.

The newest Google/Apple/email login wins. The old foreground app detects replacement within about 3 seconds and signs out locally. Background apps check on foreground. Refreshing a token or reopening an old app cannot reclaim the account. Game requests (including heartbeat, join, resume and actions) independently verify the JWT and current session in Supabase. No secret or service role key is used. Game seats are bound to verified account IDs; a room token alone cannot reclaim another account's seat.

The game server requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in production. Locally it reads the equivalent public values from apps/mobile/.env.local. Restart the server after migration and reload both apps. Anonymous visitors can browse; creating/joining a game opens login. Existing anonymous room checkpoints cannot be reclaimed as an account; create a new room.

Test: log in on Pixel 7, then log in with the same Google account on Boardgame Guest. Pixel 7 should return to login with a replacement message; its game requests must be rejected. Restart Pixel 7 and verify it cannot regain access without a new login. Use different Google accounts for multiplayer testing. Disconnect internet temporarily and verify no unverified game action succeeds. Check that token refresh does not replace the session and that logging out on the old device does not log out the new device.

This prevents concurrent use; it cannot prevent people from sharing credentials and taking turns logging in. Existing access tokens remain Supabase tokens until expiry, but protected profiles/friends/game routes check the current session separately. Apply the same guard to future wallet, purchase and record endpoints.
