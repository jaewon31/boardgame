import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';
import { authClient, authProviders } from '../services/authClient';
import { authCode, AUTH_REDIRECT } from '../services/authCallback';
WebBrowser.maybeCompleteAuthSession();
export interface Profile {id:string;display_name:string;friend_code:string}
export function useAccount() {
  const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(!!authClient);
  const [profileLoading,setProfileLoading]=useState(false),[profileError,setProfileError]=useState(false),[reload,setReload]=useState(0);
  const working=useRef(false), alive=useRef(true), generation=useRef(0), exchanging=useRef(new Set<string>());
  const [session,setSession]=useState<Session|null>(null);
  const [sessionBlocked,setSessionBlocked]=useState(!!authClient);
  useEffect(()=>{
    if(!session||!authClient)return;
    const client=authClient;let stopped=false,running=false;
    async function check(){
      if(stopped||running||AppState.currentState!=='active')return;
      running=true;
      try {
        const {data,error}=await client.rpc('current_account_session');
        if(stopped)return;
        if(error){setProfileError(true);setMessage('로그인 보안 설정을 확인하지 못했어요. 서버 설정 또는 연결을 확인해 주세요.');return;}
        if(data!==session!.user.id){
          setSessionBlocked(true);setMessage('다른 기기에서 로그인하여 이 기기의 접속이 종료됐어요.');
          await client.auth.signOut({scope:'local'});
          if(!stopped){setUser(null);setProfile(null);setSession(null);}
        }else setSessionBlocked(false);
      }catch{if(!stopped){setProfileError(true);setMessage("로그인을 확인하지 못했어요. 인터넷 연결을 확인해 주세요.");}}finally{running=false;}
    }
    void check();const timer=setInterval(()=>void check(),3000);
    const foreground=AppState.addEventListener('change',state=>{if(state==='active')void check();});
    return()=>{stopped=true;clearInterval(timer);foreground.remove();};
  },[session?.access_token]);
  async function exchange(url:string){
    const code=authCode(url);if(!code||!authClient||exchanging.current.has(code))return;
    exchanging.current.add(code);
    const {error}=await authClient.auth.exchangeCodeForSession(code, new URL(url).searchParams.get('sb_flow_id') ? {flowId:new URL(url).searchParams.get('sb_flow_id')!} : undefined);
    if(error&&alive.current)setMessage('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
  }
  useEffect(()=>{
    alive.current=true;if(!authClient)return;
    const client=authClient;
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{setSession(session);setUser(session?.user ?? null);setLoading(false);});
    void client.auth.getSession().then(({data,error})=>{if(alive.current){if(error)setMessage('로그인 정보를 확인하지 못했어요.');setSession(data.session);setSessionBlocked(!!data.session);setUser(data.session?.user??null);setLoading(false);}});
    const app=AppState.addEventListener('change',state=>{if(state==='active')client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
    if(AppState.currentState==='active')client.auth.startAutoRefresh();
    const link=Linking.addEventListener('url',event=>{void exchange(event.url);});
    void Linking.getInitialURL().then(url=>{if(url&&alive.current)void exchange(url);});
    return()=>{alive.current=false;generation.current++;subscription.unsubscribe();app.remove();link.remove();client.auth.stopAutoRefresh();};
  },[]);
  useEffect(()=>{
    const version=++generation.current;setProfile(null);setProfileError(false);setProfileLoading(!!user);
    if(!user||!authClient||sessionBlocked)return;
    void authClient.from('profiles').select('id,display_name,friend_code').eq('id',user.id).single().then(({data,error})=>{
      if(!alive.current||version!==generation.current)return;
      setProfileLoading(false);
      if(error){setProfileError(true);setMessage('프로필을 불러오지 못했어요. 다시 시도해 주세요.');}else setProfile(data);
    });
  },[user?.id,reload,sessionBlocked]);
  async function run(action:()=>Promise<void>):Promise<boolean>{if(working.current)return false;working.current=true;setBusy(true);setMessage('');try{await action();return true;}catch{if(alive.current)setMessage('요청을 완료하지 못했어요. 연결과 입력 내용을 확인해 주세요.');return false;}finally{working.current=false;if(alive.current)setBusy(false);}}
  return {user,profile,busy,loading,message,sessionBlocked,profileLoading,profileError,clearMessage:()=>setMessage(''),reloadProfile:()=>{setMessage('');setReload(value=>value+1);},configured:!!authClient,providers:authProviders,
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
