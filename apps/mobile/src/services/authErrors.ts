// Never log raw SDK errors: messages, URLs and response bodies can contain secrets.
const messages = {
  databaseSchema: '계정 서버의 데이터베이스 설정이 완료되지 않았어요. 관리자에게 세션 RPC와 마이그레이션 적용 상태를 확인해 달라고 요청해 주세요.',
  configuration: '인증 서버 설정을 확인해 주세요. Supabase URL과 공개 키를 확인한 뒤 앱을 다시 시작해 주세요.',
  network: '인증 서버에 연결하지 못했어요. 인터넷 연결과 서버 상태를 확인해 주세요.',
  signupDisabled: '현재 신규 계정 생성이 비활성화되어 있어요. 관리자에게 문의해 주세요.',
  anonymousDisabled: '익명 로그인이 비활성화되어 있어요. 관리자가 Supabase Anonymous Sign-Ins를 활성화해야 해요.',
  savedAccount: '저장된 계정의 세션을 복원하지 못했어요. 기존 기록 보호를 위해 새 계정은 만들지 않았어요. 관리자에게 문의해 주세요.',
  rateLimit: '인증 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  captcha: '인증 서버에서 CAPTCHA를 요구하고 있어요. 관리자에게 문의해 주세요.',
  server: '인증 서버에서 오류가 발생했어요. 관리자가 Supabase Auth 로그와 설정을 확인해야 해요.',
  unknown: '요청을 완료하지 못했어요. 다시 시도해 주세요.'
};
const codes: Record<string, keyof typeof messages> = {
  '25006':'databaseSchema',
  PGRST202:'databaseSchema', PGRST205:'databaseSchema',
  auth_not_configured:'configuration', signup_disabled:'signupDisabled',
  anonymous_provider_disabled:'anonymousDisabled', saved_account_unavailable:'savedAccount',
  over_request_rate_limit:'rateLimit', over_anonymous_users_rate_limit:'rateLimit', captcha_failed:'captcha',
  unexpected_failure:'server', bad_jwt:'configuration', no_authorization:'configuration'
};
export function authFailure(error:unknown) {
  const e = error && typeof error==='object' ? error as Record<string,unknown> : {};
  const status=typeof e.status==='number'&&Number.isInteger(e.status)&&e.status>=0&&e.status<=599?e.status:null;
  const code=typeof e.code==='string'&&Object.hasOwn(codes,e.code)?e.code:'unknown';
  let category: keyof typeof messages = codes[code] ?? 'unknown';
  if(category==='unknown') {
    if(status===429)category='rateLimit';
    else if(status===401||status===403)category='configuration';
    else if(status!==null&&status>=500)category='server';
    else if(e.name==='AuthRetryableFetchError'||(e.name==='TypeError'&&typeof e.message==='string'&&/network request failed|failed to fetch|fetch failed|networkerror/i.test(e.message)))category='network';
  }
  return {message:messages[category],diagnostic:{category,code,status}};
}
export function logAuthFailure(operation:string,error:unknown,development:boolean) {
  const failure=authFailure(error);
  if(development)console.warn('[auth:failure]', {operation,...failure.diagnostic});
  return failure.message;
}
