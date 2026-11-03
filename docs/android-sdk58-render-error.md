# Android SDK 58 render error investigation (2026-11-01)

## Cause and trace

The installed `com.jaewon31.boardgame` APK was last updated on October 20.
Before rebuilding, adb logcat reported JS React Native 0.88.0 versus native 0.86.3,
followed by ERR_INVALID_ARGS_NUMBER: Received 5 arguments, but 4 was expected.

`App.tsx` renders `Screens`, whose first hook is `useAccount` (line 17).
That component-stack location does not identify the throwing native call.
`useAccount` initializes React state, then restores the Supabase session in an effect:
`authClient` -> `createClient` -> `authStorage(SecureStore)`;
`ensureAccountSession` -> `getSession` -> restore or create an anonymous account.
Those asynchronous failures are caught by the hook. No five-argument native call
occurs in this initialization path. Crypto supplies Supabase's random/digest API.

The same render calls `useGameAudio` -> seven `useAudioPlayer` calls ->
`useReleasingSharedObject` -> `new AudioModule.AudioPlayer(source, updateInterval,
keepAudioSessionActive, preferredForwardBufferDuration, allowsExternalPlayback)`.
SDK 58's installed Android AudioModule has the corresponding five-argument
constructor. The old APK's native implementation expected four. Expo core's
argument validation creates the coded exception; CodedError.js merely presents it.
Do not edit CodedError.js, remove the fifth argument, or suppress the render error.
Rebuild and update-install the native development client with the same dependencies
used by Metro. App data must be retained (no uninstall or `pm clear`).

## Scope

This working tree already had uncommitted changes migrating email OTP to anonymous
accounts before this investigation. `sendCode`, `verifyOtp`, and email login UI were
already absent. This fix does not revert or extend that migration. Real email OTP
cannot be certified against this checkout. Existing auth, friends, and game logic
are untouched by this repair.

## Build and launch

- Align SDK 58 patch dependencies with `expo install --check`, including root
  React Native / expo-asset overrides and the package lock.
- `apps/mobile/plugins/withAndroidObjectPaths.cjs`, registered in app.config.ts,
  configures CMAKE_OBJECT_PATH_MAX=240. Windows Ninja otherwise fails building
  safe-area codegen with paths exceeding 260 characters. The plugin survives
  regenerated native projects and does not change runtime code.
- A broken generated app/.cxx cache initially lacked CMakeFiles/rules.ninja.
  Regenerating native build output fixes this; never delete source or app storage.
- `scripts/open-android.ps1` now launches the development client with the explicit
  ADB reverse URL instead of reusing a saved or unreachable LAN/public address.

From the repository root, after installing dependencies:

```powershell
# Apply native config when packages/config plugins change.
Push-Location apps/mobile
npx.cmd expo prebuild --platform android --no-install
Pop-Location
npm.cmd run android:build -- -Device Pixel_7
# In a separate terminal:
npm.cmd start -- --lan --port 8081 --max-workers 2
# With the game server also running:
npm.cmd run android:devices
```

## References

- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/config-plugins/plugins/
- https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html

## Final verification

Expo 58.0.22; React 19.3.0; React Native 0.88.1;
expo-modules-core 58.0.29; expo-audio 58.0.11; expo-asset 58.0.19;
expo-constants 58.0.14; expo-dev-client 58.0.18;
expo-crypto 58.0.7; expo-secure-store 58.0.2;
react-native-safe-area-context 5.10.1; react-native-svg 15.16.0.
`npm dedupe` removed the parallel old Expo/core copies left by the patch upgrade.
`npm ls expo-modules-core --all` reports only 58.0.29.

- Online `expo install --check`: passes.
- Full mobile/server/shared TypeScript checks: pass.
- Existing regression tests: 95 pass, 0 fail/skip. Includes storage, identity,
  friendship consent/RLS, real WebSocket connection/reconnection, and audio cues.
- Final Android debug build: BUILD SUCCESSFUL; update-installed on Pixel_7/API 36.
- `npm run android:devices`: passes Metro and game-server health checks and opens
  the app through the explicit ADB reverse development-client URL.
- Final running process: app UI renders; logcat shows Running main and configured
  auth. No ERR_INVALID_ARGS_NUMBER, React Native mismatch or fatal exception in
  that process's captured log. Screenshot: native-test/friends-table-sdk58.png
  in the ChatGPT workspace.

## Separate remaining backend issue

The rendered app displays the handled account/profile verification error rather
than entering the game. A read-only request to the configured Supabase REST
`current_account_session` RPC returned HTTP 404 / PGRST202: function not found in
schema cache. An unauthenticated profile-column probe returned 401 / 42501, so it
cannot establish whether nickname_setup_complete exists. No credentials or tokens
were logged, no account data was cleared, and no remote migrations were applied.
Check deployment of the existing session migration and anonymous onboarding
migration against the intended Supabase project before claiming end-to-end login,
friend addition or live game entry is verified. This is separate from the repaired
native render crash. The current checkout had already removed email OTP UI before
this task, so OTP operation is not certified by these results.
