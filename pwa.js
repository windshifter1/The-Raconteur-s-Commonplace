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

bindKeyboardInset();
