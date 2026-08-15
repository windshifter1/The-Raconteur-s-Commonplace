/**
 * Register the root service worker from any subpage.
 * Manifest start_url is the main Walk the Shelves page.
 */
const root = new URL('./', import.meta.url);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname }).catch(() => {});
}
