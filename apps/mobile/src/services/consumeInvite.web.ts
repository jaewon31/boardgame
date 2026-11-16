export function consumeInvite() {
  if(window.location.pathname.startsWith('/join/'))window.history.replaceState(null,'','/');
}
