export function needsNickname(profile: {nickname_setup_complete:boolean}|null):boolean {
  return !!profile && !profile.nickname_setup_complete;
}
export function showAccountEntry(input:{hasRoom:boolean;configured:boolean;loading:boolean;user:boolean;profile:boolean;setup:boolean;blocked:boolean;opened:boolean}):boolean {
  return !input.hasRoom && (input.opened || !input.configured || input.loading || !input.user || !input.profile || input.setup || input.blocked);
}
