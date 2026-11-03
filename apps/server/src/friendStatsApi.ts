import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FriendStatsStore } from './FriendStatsStore.ts';
import { clientIp } from './network.ts';

// Separate bounded stores prevent anonymous traffic from consuming account quotas.
// Entries stay in creation order; blocked requests never extend their lifetime.
function rateLimit() {
  const attempts = new Map<string, { at: number; count: number }>();
  return (id: string): boolean => {
    const now = Date.now();
    for (const [key, row] of attempts) {
      if (now - row.at < 60000) break;
      attempts.delete(key);
    }
    let row = attempts.get(id);
    if (!row) {
      // Fail closed without evicting a live bucket (which would reset its quota).
      if (attempts.size >= 4096) return false;
      row = { at: now, count: 0 };
      attempts.set(id, row);
    }
    if (row.count >= 30) return false;
    row.count++;
    return true;
  };
}

export function friendStatsApi(store:FriendStatsStore,authorize:(token:string)=>Promise<{accountId:string;sessionId:string}|null>,url:string,key:string,trustedProxies:string[]=[]){
 const accountAllowed=rateLimit(),anonymousAllowed=rateLimit();
 const proxies=[...trustedProxies];
 return async(request:IncomingMessage,response:ServerResponse):Promise<boolean>=>{
   if(!request.url?.startsWith('/friends/'))return false;
   const reply=(status:number,body:unknown)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(body));};
   const match=/^\/friends\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/stats$/i.exec(request.url);
   if(request.method!=='GET'||!match){reply(404,{error:'NOT_FOUND'});return true;}
   const ip=clientIp(request.socket.remoteAddress,request.headers['x-forwarded-for'],proxies);
   const token=request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]??'';
   let identity:Awaited<ReturnType<typeof authorize>>;
   try{
     // Only a verified identity may select an account bucket; JWT claims alone are not trusted.
     identity=token?await authorize(token):null;
   }catch{
     const allowed=anonymousAllowed(ip);
     reply(allowed?503:429,{error:allowed?'STATS_UNAVAILABLE':'RATE_LIMITED'});
     return true;
   }
   if(!identity){
     const allowed=anonymousAllowed(ip);
     reply(allowed?401:429,{error:allowed?'AUTH_REQUIRED':'RATE_LIMITED'});
     return true;
   }
   if(!accountAllowed(identity.accountId)){reply(429,{error:'RATE_LIMITED'});return true;}
   try{
     const friends=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/list_friends',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(4000)});
     if(!friends.ok)throw Error('FRIENDS_UNAVAILABLE');
     const rows:unknown=await friends.json();
     if(!Array.isArray(rows)||!rows.some(r=>r.other_id===match[1]&&r.status==='accepted')){reply(403,{error:'FRIEND_REQUIRED'});return true;}
     reply(200,store.compare(identity.accountId,match[1]));
   }catch{reply(503,{error:'STATS_UNAVAILABLE'});}
   return true;
 };
}
