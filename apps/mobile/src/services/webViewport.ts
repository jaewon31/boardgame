
/** Keep the table's layout viewport separate from the keyboard's visible viewport. */
export function watchWebViewport() {
  const visual = window.visualViewport;
  const root = document.documentElement;
  const touch = () => window.matchMedia('(pointer: coarse)').matches;
  const editing = () => {
    const el = document.activeElement;
    return el instanceof HTMLElement && (el.isContentEditable ||
      (el instanceof HTMLInputElement && !el.readOnly && !el.disabled && !['button','checkbox','radio','submit','range'].includes(el.type)) ||
      (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled));
  };
  let width = window.innerWidth;
  let tableHeight = visual?.height ?? window.innerHeight;
  let held = false;
  let frame: number | undefined;
  const update = () => {
    frame = undefined;
    if (visual && visual.scale !== 1) return; // Preserve accessibility zoom.
    const height = visual?.height ?? window.innerHeight;
    const rotated = width !== window.innerWidth;
    width = window.innerWidth;
    if (rotated) { held = false; tableHeight = window.innerHeight; }
    if (touch() && editing()) held = true;
    // Blur happens before the closing keyboard animation. Keep the table stable
    // until the visible viewport recovers, including Safari's delayed resize.
    if (!touch() || (!editing() && height >= tableHeight)) held = false;
    if (!held) tableHeight = height;
    root.style.setProperty('--table-viewport', `${tableHeight}px`);
    root.style.setProperty('--input-viewport', `${height}px`);
    root.style.setProperty('--visual-top', `${visual?.offsetTop ?? 0}px`);
    // Scroll only the input panel, never the game or document.
    const input = document.activeElement;
    if (input instanceof HTMLElement && editing()) {
      const panel = input.closest<HTMLElement>('[data-testid="web-modal-panel"]');
      if (panel) {
        const field = input.getBoundingClientRect(), box = panel.getBoundingClientRect();
        const top = Math.max(box.top, visual?.offsetTop ?? 0);
        const bottom = Math.min(box.bottom, (visual?.offsetTop ?? 0) + height);
        if (field.bottom > bottom) panel.scrollTop += field.bottom - bottom;
        else if (field.top < top) panel.scrollTop -= top - field.top;
      }
    }
  };
  const schedule = () => { if (frame === undefined) frame = window.requestAnimationFrame(update); };
  // Capture the pre-keyboard height synchronously before Safari changes it.
  const focus = () => { if (touch() && editing()) held = true; schedule(); };
  update();
  window.addEventListener('resize', schedule);
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', schedule);
  return () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', schedule);
    for (const key of ['--table-viewport','--input-viewport','--visual-top']) root.style.removeProperty(key);
  };
}
