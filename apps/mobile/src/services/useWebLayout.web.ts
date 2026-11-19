import { useEffect } from 'react';
import { watchWebViewport } from './webViewport';

// Scoped web overrides: native components still use their original StyleSheets.
const css = `
html, body { overflow:hidden; overscroll-behavior:none; }
html, body, #root { width:100%; height:100%; margin:0; background:#101C18; }
#root { container:table-shell / size; position:fixed; left:0; top:var(--visual-top,0px); height:100vh; height:100dvh; height:var(--table-viewport,100dvh); overflow:hidden; padding-left:env(safe-area-inset-left); padding-right:env(safe-area-inset-right); box-sizing:border-box; }
input, textarea { font-size:16px; scroll-margin-block:24px; }
[role="button"], [role="tab"], [role="radio"] { touch-action:manipulation; flex-shrink:0; }
[role="button"]:focus-visible, [role="tab"]:focus-visible { outline:2px solid #DFC98D; outline-offset:2px; }
[data-testid="web-page"] { height:var(--input-viewport,100dvh); max-height:var(--input-viewport,100dvh); overflow-y:auto; overflow-x:hidden; }
[data-testid="web-page-content"] { flex-shrink:0; min-height:100%; }
[data-testid="web-page-content"] > * { flex-shrink:0; }
[data-testid="web-page-content"] > div { min-height:min-content; }
[data-testid="web-lobby"], [data-testid="web-stats"] {
  overflow-y:auto; overflow-x:hidden; justify-content:flex-start; width:100%; max-width:600px; align-self:center;
}
[data-testid="web-lobby"] > *, [data-testid="web-stats"] > * { flex-shrink:0; }
[data-testid="web-stats"] > div { min-height:min-content; }
[data-testid="web-game"] { overflow-y:auto; overflow-x:hidden; justify-content:center; }
[data-testid="web-game-header"], [data-testid="web-game-ribbon"], [data-testid="web-game-footer"] {
  width:100%; max-width:900px; align-self:center; flex-shrink:0;
}
[data-testid="web-game-table"] {
  align-self:center; width:calc(100% - 24px); max-width:760px; min-height:460px; max-height:700px; flex-shrink:0;
}
[data-testid="web-game-footer"] { margin-top:0; }
[data-testid="web-seat-name"] { white-space:normal; overflow-wrap:anywhere; line-height:13px; height:26px; }
[data-testid="web-seat-head"] { align-items:flex-start; }
[data-testid="web-modal-overlay"] {
  position:fixed !important; left:0; right:0; top:var(--visual-top,0px); bottom:auto;
  height:var(--input-viewport,100dvh) !important; max-height:var(--input-viewport,100dvh); box-sizing:border-box;
  padding-top:max(12px,env(safe-area-inset-top)) !important;
  padding-bottom:max(12px,env(safe-area-inset-bottom)) !important;
  padding-left:max(16px,env(safe-area-inset-left)) !important;
  padding-right:max(16px,env(safe-area-inset-right)) !important;
}
[data-testid="web-modal-panel"] {
  width:100%; max-width:480px; align-self:center; max-height:100%; overflow-y:auto; flex-shrink:1;
}
[data-testid="web-modal-panel"] > * { flex-shrink:0; }
[data-testid="web-review"] { overflow:hidden; }
@container table-shell (max-height:600px) {
  [data-testid="web-page-content"] { justify-content:flex-start; }
  [data-testid="web-game"] { justify-content:flex-start; }
  [data-testid="web-game-table"] { min-height:460px; flex-grow:0; }
  [data-testid="web-game-footer"] { position:sticky; bottom:0; background:#07130F; z-index:3; }
}
@container table-shell (min-aspect-ratio:1/1) and (max-height:600px) and (min-width:600px) {
  [data-testid="web-game"] { display:grid; grid-template-columns:minmax(0,1fr) 176px; grid-template-rows:50px minmax(275px,1fr); }
  [data-testid="web-game-header"] { grid-column:1; grid-row:1; }
  [data-testid="web-game-ribbon"] { grid-column:2; grid-row:1; align-self:start; flex-wrap:wrap; padding:8px; gap:4px; }
  [data-testid="web-game-ribbon"] > div:first-child { min-width:100%; font-size:11px; }
  [data-testid="web-game-table"] { grid-column:1; grid-row:2; width:calc(100% - 16px); height:100%; min-height:275px; max-height:none; margin:0 8px; }
  [data-testid="web-game-footer"] { grid-column:2; grid-row:2; position:static; margin:48px 0 0; align-self:end; padding:8px; }
  [data-testid="web-game-actions"] { flex-direction:column; align-items:stretch; gap:8px; }
  [data-testid="web-game-actions"] > [role="button"] { flex:none; height:54px; min-height:54px; }
  [data-testid="web-seat-name"] { height:13px; white-space:nowrap; }
  [data-testid="web-seat-head"] { padding:0; }
}
@media(prefers-reduced-motion:reduce) { *, *::before, *::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; } }
`;

export function useWebLayout() {
  useEffect(() => {
    const style=document.createElement('style');style.textContent=css;document.head.append(style);
    const viewport=document.querySelector('meta[name="viewport"]');
    const previous=viewport?.getAttribute('content');
    viewport?.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');
    const disposeViewport=watchWebViewport();
    return()=>{style.remove();disposeViewport();if(previous)viewport?.setAttribute('content',previous);};
  },[]);
}
