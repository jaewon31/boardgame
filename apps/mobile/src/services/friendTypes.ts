export interface FriendRow { id:string; other_id:string; display_name:string; status:'pending'|'accepted'; incoming:boolean; created_at:string }
export function normalizeFriendCode(value:string):string {return value.trim().toUpperCase().replace(/[\s-]/g,'');}
export function friendError(error:{message?:string;code?:string}|null):string {
  if(error?.code==='PGRST202'||error?.code==='42883')return '친구 기능을 준비 중이에요. 잠시 후 다시 열어 주세요.';
  const errors:Record<string,string>={AUTH_REQUIRED:'다시 로그인해 주세요.',INVALID_FRIEND_CODE:'친구 코드 12자리를 확인해 주세요.',FRIEND_NOT_FOUND:'코드에 해당하는 친구를 찾지 못했어요.',SELF_REQUEST:'내 코드로는 요청할 수 없어요.',PENDING_LIMIT:'보낸 요청은 최대 20개예요. 기다리거나 취소해 주세요.',FRIEND_LIMIT:'친구는 최대 200명까지 추가할 수 있어요.',RECIPIENT_BUSY:'상대방의 요청함이 가득 찼어요. 나중에 다시 시도해 주세요.',DAILY_REQUEST_LIMIT:'오늘의 친구 요청 한도에 도달했어요.',REQUEST_UNAVAILABLE:'이미 처리된 요청이에요. 목록을 새로고침해 주세요.'};
  return errors[error?.message??'']??'연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
