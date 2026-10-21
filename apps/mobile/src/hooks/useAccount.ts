import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { User } from '@supabase/supabase-js';
import { authClient, authProviders } from '../services/authClient';
import { authCode, AUTH_REDIRECT } from '../services/authCallback';
WebBrowser.maybeCompleteAuthSession();
export interface Profile {id:string;display_name:string;friend_code:string}
export function useAccount() {
  const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(!!authClient);
  const [profileLoading,setProfileLoading]=useState(false),[profileError,setProfileError]=useState(false),[reload,setReload]=useState(0);
  const working=useRef(false), alive=useRef(true), generation=useRef(0), exchanging=useRef(new Set<string>());
  async function exchange(url:string){
    const code=authCode(url);if(!code||!authClient||exchanging.current.has(code))return;
    exchanging.current.add(code);
    const {error}=await authClient.auth.exchangeCodeForSession(code, new URL(url).searchParams.get('sb_flow_id') ? {flowId:new URL(url).searchParams.get('sb_flow_id')!} : undefined);
    if(error&&alive.current)setMessage('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
  }
  useEffect(()=>{
    alive.current=true;if(!authClient)return;
    const client=authClient;
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{setUser(session?.user ?? null);setLoading(false);});
    void client.auth.getSession().then(({data,error})=>{if(alive.current){if(error)setMessage('로그인 정보를 확인하지 못했어요.');setUser(data.session?.user??null);setLoading(false);}});
    const app=AppState.addEventListener('change',state=>{if(state==='active')client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
    if(AppState.currentState==='active')client.auth.startAutoRefresh();
    const link=Linking.addEventListener('url',event=>{void exchange(event.url);});
    void Linking.getInitialURL().then(url=>{if(url&&alive.current)void exchange(url);});
    return()=>{alive.current=false;generation.current++;subscription.unsubscribe();app.remove();link.remove();client.auth.stopAutoRefresh();};
  },[]);
  useEffect(()=>{
    const version=++generation.current;setProfile(null);setProfileError(false);setProfileLoading(!!user);
    if(!user||!authClient)return;
    void authClient.from('profiles').select('id,display_name,friend_code').eq('id',user.id).single().then(({data,error})=>{
      if(!alive.current||version!==generation.current)return;
      setProfileLoading(false);
      if(error){setProfileError(true);setMessage('프로필을 불러오지 못했어요. 다시 시도해 주세요.');}else setProfile(data);
    });
  },[user?.id,reload]);
  async function run(action:()=>Promise<void>):Promise<boolean>{if(working.current)return false;working.current=true;setBusy(true);setMessage('');try{await action();return true;}catch{if(alive.current)setMessage('요청을 완료하지 못했어요. 연결과 입력 내용을 확인해 주세요.');return false;}finally{working.current=false;if(alive.current)setBusy(false);}}
  return {user,profile,busy,loading,message,profileLoading,profileError,clearMessage:()=>setMessage(''),reloadProfile:()=>{setMessage('');setReload(value=>value+1);},configured:!!authClient,providers:authProviders,
    sendCode:(email:string)=>run(async()=>{if(!authClient)throw Error();const {error}=await authClient.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:true}});if(error)throw error;setMessage('인증 코드를 보냈어요. 메일함을 확인해 주세요.');}),
    verifyCode:(email:string,token:string)=>run(async()=>{if(!authClient)throw Error();const {error}=await authClient.auth.verifyOtp({email:email.trim(),token:token.trim(),type:'email'});if(error)throw error;}),
    social:(provider:'google'|'apple')=>run(async()=>{
      if(Constants.appOwnership==='expo'){setMessage('간편 로그인은 설치형 테스트 앱에서 사용할 수 있어요. 여기서는 이메일 인증을 이용해 주세요.');return;}
      if(!authClient||!authProviders[provider])throw Error();
      const {data,error}=await authClient.auth.signInWithOAuth({provider,options:{redirectTo:AUTH_REDIRECT,skipBrowserRedirect:true}});if(error||!data.url)throw error??Error();
      const result=await WebBrowser.openAuthSessionAsync(data.url,AUTH_REDIRECT);if(result.type==='success')await exchange(result.url);
    }),
    saveName:(name:string)=>run(async()=>{const clean=name.trim().normalize('NFC');if(!authClient||!user||[...clean].length<1||[...clean].length>12||/[\p{Cc}\p{Cf}]/u.test(clean))throw Error();const {data,error}=await authClient.from('profiles').update({display_name:clean}).eq('id',user.id).select('id,display_name,friend_code').single();if(error)throw error;const completed=await authClient.auth.updateUser({data:{nickname_setup_complete:true}});if(completed.error)throw completed.error;setUser(completed.data.user);setProfile(data);setMessage('닉네임을 저장했어요.');}),
    signOut:()=>run(async()=>{if(!authClient)return;const {error}=await authClient.auth.signOut({scope:'local'});if(error)throw error;setProfile(null);setUser(null);}),
  };
}
export type Account=ReturnType<typeof useAccount>;
