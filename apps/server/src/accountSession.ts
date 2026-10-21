export function accountAuthorizer(url: string, key: string) {
  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url) || !key.startsWith('sb_publishable_')) {
    throw new Error('Invalid Supabase authentication configuration');
  }
  return async (token: string): Promise<{accountId:string;sessionId:string} | null> => {
    if (!token || token.length > 8192) return null;
    const response = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/current_account_session', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      if (response.status >= 500 || response.status === 404 || response.status === 429) throw new Error('Authentication unavailable');
      return null;
    }
    const id: unknown = await response.json();
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return null;
    // RPC success verifies this exact JWT; only then trust its session claim.
    let sessionId:unknown;
    try{sessionId=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id;}catch{return null;}
    return typeof sessionId==='string' && /^[0-9a-f-]{36}$/i.test(sessionId)?{accountId:id,sessionId}:null;
  };
}
