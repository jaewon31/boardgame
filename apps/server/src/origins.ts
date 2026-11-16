// Origins are exact serialized origins, never suffixes, globs or request-reflected values.
export function parseOrigins(value: string | undefined, production = false): string[] {
  const origins=(value??'').split(',').map(v=>v.trim()).filter(Boolean);
  for(const origin of origins) {
    let url:URL;
    try {url=new URL(origin);} catch {throw new Error('Invalid WEB_ALLOWED_ORIGINS');}
    if(url.origin!==origin || !['http:','https:'].includes(url.protocol) || (production&&url.protocol!=='https:'))throw new Error('Invalid WEB_ALLOWED_ORIGINS');
  }
  return [...new Set(origins)];
}
export function allowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  // Native clients omit Origin; every application command still requires JWT auth.
  return origin===undefined || allowed.includes(origin);
}
