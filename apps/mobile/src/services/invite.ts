const codePattern = /^[A-Z2-9]{8}$/;
export function inviteCode(url: string | null): string | null {
  if (!url || url.length > 2048) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    let path: string;
    if (parsed.protocol === 'friendstable:' && parsed.host === 'join') path = parsed.pathname;
    else if (parsed.protocol === 'exp:' || parsed.protocol === 'exps:') {
      if (!parsed.pathname.startsWith('/--/join/')) return null;
      path = parsed.pathname.slice('/--/join'.length);
    } else if(parsed.protocol==='https:' || parsed.protocol==='http:') {
      if(!parsed.pathname.startsWith('/join/'))return null;
      path=parsed.pathname.slice('/join'.length);
    } else return null;
    const code = path.slice(1).toUpperCase();
    return codePattern.test(code) ? code : null;
  } catch { return null; }
}
export function webInviteUrl(code:string, origin:string, development=false):string {
  if(!codePattern.test(code))throw new Error('Invalid invite code');
  const url=new URL(origin);
  if(url.origin!==origin || (url.protocol!=='https:' && !(development&&url.protocol==='http:')))throw new Error('Invalid web app origin');
  return `${url.origin}/join/${code}`;
}
export function inviteUrl(code: string, expoHost?: string): string {
  if (!codePattern.test(code)) throw new Error('Invalid invite code');
  return expoHost ? 'exp://' + expoHost + '/--/join/' + code : 'friendstable://join/' + code;
}
