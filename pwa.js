/**
 * Register the root service worker from any subpage.
 * Manifest start_url is the main Walk the Shelves page.
 */
const root = new URL('./', import.meta.url);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname }).catch(() => {});
}

function bindKeyboardInset() {
  const rootEl = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = () => {
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    rootEl.style.setProperty('--keyboard-inset', `${inset}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  window.addEventListener('orientationchange', sync);
  sync();
}

function dismissBootHearth() {
  const el = document.getElementById('boot-hearth');
  if (!el || el.classList.contains('is-done')) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const min = reduce ? 180 : 1700;
  const wait = Math.max(0, min - performance.now());
  window.setTimeout(() => {
    el.classList.add('is-done');
    el.setAttribute('aria-busy', 'false');
    const remove = () => el.remove();
    el.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, 900);
  }, wait);
}

bindKeyboardInset();

if (document.readyState === 'complete') dismissBootHearth();
else window.addEventListener('load', dismissBootHearth);
window.setTimeout(dismissBootHearth, 4200);
