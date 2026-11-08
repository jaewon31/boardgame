import { logRecord } from '@boardgame/shared';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { authClient } from '../services/authClient';
import { createSessionStore } from '../services/sessionStore';
import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { RoomSettings, EntryRequest, PokerAction } from '@boardgame/shared';
import { RoomClient, emptyState, type RoomState } from '../services/RoomClient';
import { roomPhase, roomStateForAccount } from '../services/roomView';
import { getServerUrl } from '../services/serverUrl';

export function useRoom(accountId: string | null) {
  const [snapshot, setSnapshot] = useState<{accountId: string | null; state: RoomState}>({ accountId: null, state: emptyState });
  const client = useRef<{accountId: string; connection: RoomClient} | null>(null);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    const endpoint = getServerUrl();
    const connection = new RoomClient(endpoint, state => {
      if (active) setSnapshot({ accountId, state });
    }, {}, createSessionStore(endpoint));
    // Same SHA-256 prefix as the server: compare identities without logging UUIDs/JWTs.
    void digestStringAsync(CryptoDigestAlgorithm.SHA256, accountId).then(hash => {
      if (active) console.info(JSON.stringify(logRecord({event: 'client_account', clientId: connection.diagnosticId, accountRef: hash.slice(0, 16)})));
    }).catch(() => {});
    connection.accessToken = async () => {
      const result = await authClient?.auth.getSession();
      const session = result?.data.session;
      if (!active || session?.user.id !== accountId || !session.access_token) throw Error('AUTH_REQUIRED');
      return session.access_token;
    };
    client.current = { accountId, connection };
    connection.recordAppState(AppState.currentState);
    void connection.restore();
    const subscription = AppState.addEventListener('change', state => { connection.recordAppState(state); if (state === 'active') connection.refresh(true); });
    return () => { active = false; subscription.remove(); connection.dispose(); client.current = null; };
  }, [accountId]);
  // Mask old account data synchronously, before the new effect has run.
  const state = roomStateForAccount(accountId, snapshot);
  const current = () => client.current?.accountId === accountId ? client.current.connection : null;
  return {
    ...state, phase: roomPhase(state),
    enter: (request: EntryRequest) => current()?.enter(request),
    updateSettings: (settings: RoomSettings, revision?: number) => current()?.updateSettings(settings, revision) ?? Promise.reject(new Error('서버에 연결해 주세요.')),
    startHand: () => current()?.startHand(),
    revealRiver: (handId: string) => current()?.revealRiver(handId),
    revealCards: (handId: string) => current()?.revealCards(handId),
    resetChips: () => current()?.resetChips(),
    act: (action: PokerAction, amount?: number) => current()?.act(action, amount),
    refresh: () => current()?.refresh(),
    cancel: () => current()?.cancel(),
    clearNotice: () => current()?.clearNotice(),
    leave: () => current()?.leave(),
  };
}
