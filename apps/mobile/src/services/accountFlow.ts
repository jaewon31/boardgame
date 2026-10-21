export function needsNickname(profile: {display_name:string}|null, metadata:Record<string,unknown>|undefined):boolean {
  return !!profile && metadata?.nickname_setup_complete !== true && profile.display_name === '플레이어';
}
export function showAccountEntry(input:{hasRoom:boolean;configured:boolean;loading:boolean;user:boolean;profile:boolean;setup:boolean;guest:boolean;opened:boolean}):boolean {
  return !input.hasRoom && (input.opened || (input.configured && (input.loading || (input.user ? !input.profile || input.setup : !input.guest))));
}
