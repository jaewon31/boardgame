import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authClient } from '../services/authClient';
import { friendError, normalizeFriendCode, type FriendRow } from '../services/friendTypes';
export function useFriends(userId:string|null) {
  const [rows,setRows]=useState<FriendRow[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loadError,setLoadError]=useState('');
  const alive=useRef(false),epoch=useRef(0),fetching=useRef(false),working=useRef(false);
  async function refresh(){
    if(!authClient||!userId||fetching.current)return;
    const version=epoch.current;fetching.current=true;
    try{const {data,error}=await authClient.rpc('list_friends');if(alive.current&&version===epoch.current){if(error)setLoadError(friendError(error));else {setLoadError('');setRows((data??[]) as FriendRow[]);}}}
    catch{if(alive.current&&version===epoch.current)setLoadError('친구 목록을 불러오지 못했어요.');}
    finally{fetching.current=false;if(alive.current&&version===epoch.current)setLoading(false);}
  }
  useEffect(()=>{
    alive.current=true;epoch.current++;setRows([]);setMessage('');setLoading(true);void refresh();
    const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},10000);
    const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
    return()=>{alive.current=false;epoch.current++;clearInterval(timer);sub.remove();};
  },[userId]);
  async function action(name:string,args:Record<string,unknown>,success:string){
    if(!authClient||!userId||working.current)return false;
    working.current=true;setBusy(true);setMessage('');const version=epoch.current;
    try{
      const {data,error}=await authClient.rpc(name,args);if(error)throw error;
      if(!alive.current||version!==epoch.current)return false;
      const messages:Record<string,string>={already_friends:'이미 친구인 사용자예요.',incoming_request:'상대가 먼저 요청했어요. 받은 요청에서 수락해 주세요.',request_pending:'친구 요청을 보냈어요. 상대의 수락을 기다려 주세요.'};
      setMessage(messages[String(data)]??success);await refresh();return true;
    }catch(error){if(alive.current&&version===epoch.current)setMessage(friendError(error as {message?:string;code?:string}));return false;}
    finally{working.current=false;if(alive.current&&version===epoch.current)setBusy(false);}
  }
  return {rows,loading,busy,message:loadError||message,refresh,
    request:(code:string)=>action('request_friend',{friend_code_input:normalizeFriendCode(code)},'친구 요청을 보냈어요.'),
    respond:(id:string,accept:boolean)=>action('respond_friend',{request_id:id,accept_request:accept},accept?'친구가 되었어요.':'요청을 거절했어요.'),
    remove:(id:string)=>action('remove_friend',{request_id:id},'목록에서 삭제했어요.'),
  };
}
