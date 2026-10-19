import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import type { HoldemView } from '@boardgame/shared';
import { SoundEvents, type GameSound } from '../services/soundEvents';
export function useGameAudio(hand: HoldemView | null, playerId: string | null, connected: boolean) {
  const deal=useAudioPlayer(require('../../assets/audio/deal.wav'));
  const card=useAudioPlayer(require('../../assets/audio/card.wav'));
  const chips=useAudioPlayer(require('../../assets/audio/chips.wav'));
  const turn=useAudioPlayer(require('../../assets/audio/turn.wav'));
  const warning=useAudioPlayer(require('../../assets/audio/warning.wav'));
  const win=useAudioPlayer(require('../../assets/audio/win.wav'));
  const collect=useAudioPlayer(require('../../assets/audio/collect.wav'));
  const players=useMemo(()=>({deal,card,chips,turn,warning,win,collect}),[deal,card,chips,turn,warning,win,collect]);
  const [level,setLevel]=useState(0.5), [muted,setMuted]=useState(false), [loaded,setLoaded]=useState(false), [ready,setReady]=useState(false);
  const [active,setActive]=useState(AppState.currentState==='active');
  const [now,setNow]=useState(Date.now());
  const events=useRef(new SoundEvents());
  const generation=useRef(0);
  const writes=useRef(Promise.resolve());
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;
    void SecureStore.getItemAsync('table-audio').then(raw=>{
      if(!live || !raw)return;
      const value=JSON.parse(raw);
      if(typeof value.level==='number' && value.level>=0 && value.level<=1)setLevel(value.level);
      if(typeof value.muted==='boolean')setMuted(value.muted);
    }).catch(()=>{}).finally(()=>{if(live)setLoaded(true);});
    void setAudioModeAsync({playsInSilentMode:false,shouldPlayInBackground:false,allowsRecording:false,interruptionMode:'mixWithOthers'}).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)setError('오디오 초기화에 실패했어요. 앱을 다시 열어 주세요.');});
    const sub=AppState.addEventListener('change',state=>setActive(state==='active'));
    const timer=setInterval(()=>setNow(Date.now()),250);
    return ()=>{live=false;sub.remove();clearInterval(timer);generation.current++;};
  },[]);
  useEffect(()=>{
    if(!loaded)return;
    writes.current=writes.current.then(()=>SecureStore.setItemAsync('table-audio',JSON.stringify({level,muted}))).catch(()=>{});
  },[level,muted,loaded]);
  useEffect(()=>{
    generation.current++;
    for(const player of Object.values(players)) {
      player.volume=muted ? 0 : level;
      if(muted || !active || !connected || level===0) player.pause();
    }
  },[players,level,muted,active,connected]);
  function play(sound:GameSound) {
    if(!loaded || !ready || muted || level===0 || !active || !connected)return;
    const player=players[sound], version=generation.current;
    if(!player.isLoaded)return;
    player.pause();
    void player.seekTo(0).then(()=>{if(version===generation.current)player.play();}).catch(()=>setError('효과음을 재생하지 못했어요.'));
  }
  useEffect(()=>{
    const cues=events.current.update(hand,playerId,connected&&active,now);
    cues.forEach(play);
  },[hand,playerId,connected,active,now]);
  return {level,muted,loaded,error,setLevel,setMuted,preview:()=>play('turn')};
}
export type GameAudio = ReturnType<typeof useGameAudio>;
