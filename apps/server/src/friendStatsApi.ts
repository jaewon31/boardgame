import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FriendStatsStore } from './FriendStatsStore.ts';
export function friendStatsApi(store:FriendStatsStore,authorize:(token:string)=>Promise<{accountId:string;sessionId:string}|null>,url:string,key:string){
 const attempts=new Map<string,{at:number;count:number}>();
 return async(request:IncomingMessage,response:ServerResponse):Promise<boolean>=>{
   if(!request.url?.startsWith('/friends/'))return false;
   const reply=(status:number,body:unknown)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(body));};
   const match=/^\/friends\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/stats$/i.exec(request.url);
   if(request.method!=='GET'||!match){reply(404,{error:'NOT_FOUND'});return true;}
   const ip=request.socket.remoteAddress??'',now=Date.now();
   for(const [id,row]of attempts)if(now-row.at>=60000)attempts.delete(id);
   const attempt=attempts.get(ip)??{at:now,count:0};
   if((!attempts.has(ip)&&attempts.size>=4096)||++attempt.count>30){reply(429,{error:'RATE_LIMITED'});return true;}attempts.set(ip,attempt);
   const token=request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]??'';
   try{
     const identity=await authorize(token);if(!identity){reply(401,{error:'AUTH_REQUIRED'});return true;}
     const friends=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/list_friends',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(4000)});
     if(!friends.ok)throw Error('FRIENDS_UNAVAILABLE');
     const rows:unknown=await friends.json();
     if(!Array.isArray(rows)||!rows.some(r=>r.other_id===match[1]&&r.status==='accepted')){reply(403,{error:'FRIEND_REQUIRED'});return true;}
     reply(200,store.compare(identity.accountId,match[1]));
   }catch{reply(503,{error:'STATS_UNAVAILABLE'});}
   return true;
 };
}
