export const AUTH_REDIRECT='friendstable://auth/callback';
export function authCode(url:string):string|null {
  try {const parsed=new URL(url);if(parsed.protocol!=='friendstable:'||parsed.hostname!=='auth'||parsed.pathname!=='/callback'||parsed.username||parsed.password||parsed.port||parsed.hash)return null;
    const codes=parsed.searchParams.getAll('code');return codes.length===1&&codes[0].length>0&&codes[0].length<2048?codes[0]:null;
  }catch{return null;}
}
