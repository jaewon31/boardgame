import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { authClient, accountStorage } from '../services/authClient';
import { ensureAccountSession } from '../services/anonymousSession';
import { logAuthFailure } from '../services/authErrors';
export interface Profile {id:string;display_name:string;friend_code:string;nickname_setup_complete:boolean}
const profileFields='id,display_name,friend_code,nickname_setup_complete';
export function useAccount() {
  const [session,setSession]=useState<Session|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(!!authClient);
  const [message,setMessage]=useState(''),[sessionBlocked,setSessionBlocked]=useState(true);
  const [profileLoading,setProfileLoading]=useState(false),[profileError,setProfileError]=useState(false);
  const [retry,setRetry]=useState(0);
  const alive=useRef(false),working=useRef(false);
  const identity=useRef<string|null>(null),profileRevision=useRef(0);
  const user=session?.user??null;
  useEffect(()=>{
    alive.current=true;
    return()=>{alive.current=false;};
  },[]);
  useEffect(()=>{
    if(!authClient)return;
    const client=authClient;let stopped=false;
    setLoading(true);setMessage('');
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{
      if(stopped)return;
      if(identity.current!==(next?.user.id??null)){
        identity.current=next?.user.id??null;profileRevision.current++;
        setProfile(null);setSessionBlocked(true);
      }
      setSession(next);
      if(!next){setSessionBlocked(true);setProfile(null);setMessage('저장된 계정에 접속할 수 없어요. 연결 상태를 확인하고 다시 시도해 주세요.');}
    });
    void ensureAccountSession(client.auth,accountStorage).then(next=>{
      if(!stopped)setSession(next);
    }).catch(error=>{
      if(!stopped)setMessage(logAuthFailure('restore_or_create_account',error,__DEV__));
    }).finally(()=>{if(!stopped)setLoading(false);});
    const app=AppState.addEventListener('change',state=>{if(state==='active')client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
    if(AppState.currentState==='active')client.auth.startAutoRefresh();
    return()=>{stopped=true;subscription.unsubscribe();app.remove();client.auth.stopAutoRefresh();};
  },[retry]);
  useEffect(()=>{
    if(!session||!authClient)return;
    const client=authClient;let stopped=false,running=false;
    // Keep an already verified account connected during token refresh.
    setProfileError(false);setProfileLoading(true);
    async function check(){
      if(stopped||running||AppState.currentState!=='active')return;
      running=true;const revision=profileRevision.current;
      let stage='session_rpc';
      try{
        const current=await client.rpc('current_account_session');
        if(current.error)throw current.error;
        if(current.data!==session!.user.id)throw {code:current.data===null?'account_session_null':'account_session_mismatch'};
        stage='profile_read';
        const result=await client.from('profiles').select(profileFields).eq('id',session!.user.id).single();
        if(result.error)throw result.error;
        if(!stopped){if(revision===profileRevision.current)setProfile(result.data);setSessionBlocked(false);setProfileError(false);setMessage('');}
      }catch(error){
        if(__DEV__){
          const e=error&&typeof error==='object'?error as Record<string,unknown>:{};
          const safeCode=typeof e.code==='string'&&(/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(e.code)||['account_session_null','account_session_mismatch'].includes(e.code))?e.code:'unknown';
          console.warn('[account:check]',{stage,code:safeCode});
        }
        // Never sign out or silently replace an anonymous account on transient failure.
        if(!stopped){setSessionBlocked(true);setProfileError(true);setMessage(logAuthFailure('verify_account_profile',error,__DEV__));}
      }finally{running=false;if(!stopped)setProfileLoading(false);}
    }
    void check();const timer=setInterval(()=>void check(),10000);
    const app=AppState.addEventListener('change',state=>{if(state==='active')void check();});
    return()=>{stopped=true;clearInterval(timer);app.remove();};
  },[session?.access_token,retry]);
  async function saveName(name:string):Promise<boolean>{
    if(working.current)return false;
    working.current=true;setBusy(true);setMessage('');
    const revision=++profileRevision.current;
    try{
      const clean=name.trim().normalize('NFC');
      if(!authClient||!user||sessionBlocked||[...clean].length<1||[...clean].length>12||/[\p{Cc}\p{Cf}]/u.test(clean))throw Error('Invalid nickname');
      // One atomic row update, avoiding profile/metadata partial completion.
      const {data,error}=await authClient.from('profiles').update({display_name:clean,nickname_setup_complete:true}).eq('id',user.id).select(profileFields).single();
      if(error)throw error;
      if(!alive.current||revision!==profileRevision.current)return false;
      profileRevision.current++; // Ignore profile reads started while this save was in flight.
      setProfile(data);setMessage('닉네임을 저장했어요.');
      return true;
    }catch(error){if(alive.current)setMessage(logAuthFailure('save_nickname',error,__DEV__));return false;}
    finally{working.current=false;if(alive.current)setBusy(false);}
  }
  return {user,profile,busy,loading,message,sessionBlocked,profileLoading,profileError,configured:!!authClient,
    clearMessage:()=>setMessage(''),reloadProfile:()=>setRetry(value=>value+1),saveName};
}
export type Account=ReturnType<typeof useAccount>;
