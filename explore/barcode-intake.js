/**
 * Barcode → ISBN → collection check → metadata → accept/reject.
 * Lives in the existing Add Books barcode tab.
 */
import { createBarcodeScanner } from './barcode-scanner.js';
import { lookupIsbn } from './book-lookup.js';
import { addToCollection, findInCollection, findLocalByIsbn } from './collection.js';
import { playDuplicateBeep, playSuccessBeep, unlockBeep } from './barcode-beep.js';
import { looksLikeBarcode, normalizeIsbn } from './isbn.js';
import { sprinkleButtonMotes } from '../lib/ember-motes.js';

const panel = document.querySelector('[data-intake-panel="barcode"]');
const video = document.getElementById('scanner-video');
const stage = document.getElementById('scanner-stage');
const liveEl = document.getElementById('scanner-live');
const toastEl = document.getElementById('scanner-toast');
const resultEl = document.getElementById('scanner-result');
const permissionEl = document.getElementById('scanner-permission');
const permissionTitle = document.getElementById('scanner-permission-title');
const permissionCopy = document.getElementById('scanner-permission-copy');
const requestBtn = document.getElementById('scanner-request-camera');
const closePermissionBtn = document.getElementById('scanner-close-permission');
const manualForm = document.getElementById('scanner-manual');
const manualInput = document.getElementById('scanner-isbn-input');

const CAMERA_GRANTED_KEY = 'trc-camera-granted';

let scanner = null;
let busy = false;
let selectedCover = null;
let pendingBook = null;
let lastLookup = null;
let toastTimer = 0;
let ignoreUntil = new Map();

function setCameraGranted(value) {
  try {
    if (value) localStorage.setItem(CAMERA_GRANTED_KEY, '1');
    else localStorage.removeItem(CAMERA_GRANTED_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function authorLine(book) {
  const authors = book?.authors?.length ? book.authors : [];
  return authors.length ? authors.join(', ') : (book?.author || 'Unknown author');
}

function sourceTags(source) {
  const labels = source === 'both'
    ? ['Open Library', 'Google Books']
    : source === 'google-books'
      ? ['Google Books']
      : ['Open Library'];
  return labels.map((label) => `<span class="source-tag">${escapeHtml(label)}</span>`).join('');
}

function ignored(isbn13) {
  const until = ignoreUntil.get(isbn13);
  if (!until) return false;
  if (Date.now() > until) {
    ignoreUntil.delete(isbn13);
    return false;
  }
  return true;
}

function ignoreIsbn(isbn13, ms) {
  ignoreUntil.set(isbn13, Date.now() + ms);
}

function setLive(text) {
  if (liveEl) liveEl.textContent = text;
}

function toast(text) {
  if (!toastEl) return;
  toastEl.hidden = false;
  toastEl.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}

function hideResult() {
  if (!resultEl) return;
  resultEl.hidden = true;
  resultEl.innerHTML = '';
  resultEl.className = 'scanner-result';
  if (manualForm) manualForm.hidden = false;
}

function showPermission({ title, copy, canRetry }) {
  if (stage) stage.hidden = true;
  if (manualForm) manualForm.hidden = false;
  if (!permissionEl) return;
  permissionEl.hidden = false;
  if (permissionTitle) permissionTitle.textContent = title;
  if (permissionCopy) permissionCopy.textContent = copy;
  if (requestBtn) requestBtn.hidden = !canRetry;
}

function hidePermission() {
  if (permissionEl) permissionEl.hidden = true;
}

function coverMarkup(url, className = 'intake-cover scanner-cover') {
  if (url) {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="" width="120" height="180" />`;
  }
  return `<span class="${className} intake-cover--empty" aria-hidden="true"></span>`;
}

function uniqueCoverUrls(book) {
  const urls = [];
  const seen = new Set();
  const add = (url) => {
    const u = String(url || '').trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };
  add(book.coverUrl);
  for (const item of book.availableCovers || []) add(item.url);
  return urls;
}

function bindCoverErrors(root) {
  root.querySelectorAll('img.scanner-cover, img.scanner-cover-thumb').forEach((img) => {
    img.addEventListener('error', () => {
      const btn = img.closest('[data-cover-url]');
      if (btn) {
        btn.remove();
        const left = uniqueCoverUrls(pendingBook || {}).filter((url) =>
          [...resultEl.querySelectorAll('[data-cover-url]')].some((el) => el.dataset.coverUrl === url)
            || url === selectedCover,
        );
        if (img.classList.contains('scanner-cover')) {
          selectedCover = null;
          const next = resultEl.querySelector('[data-cover-url]');
          if (next) selectCover(next.dataset.coverUrl);
          else {
            const holder = resultEl.querySelector('.scanner-hero-cover');
            if (holder) holder.innerHTML = coverMarkup(null);
          }
        }
        const carousel = resultEl.querySelector('.cover-carousel');
        if (carousel && carousel.children.length < 2) carousel.remove();
        return;
      }
      img.replaceWith(Object.assign(document.createElement('span'), {
        className: `${img.className} intake-cover--empty`,
      }));
    });
  });
}

function selectCover(url) {
  selectedCover = url || null;
  const hero = resultEl?.querySelector('.scanner-hero-cover');
  if (hero) hero.innerHTML = coverMarkup(selectedCover);
  resultEl?.querySelectorAll('[data-cover-url]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.coverUrl === selectedCover));
  });
  if (pendingBook) pendingBook.coverUrl = selectedCover;
  bindCoverErrors(resultEl);
}

function renderDuplicate(existing, { beep = true } = {}) {
  if (beep) playDuplicateBeep();
  if (manualForm) manualForm.hidden = true;
  if (stage) stage.hidden = true;
  resultEl.hidden = false;
  resultEl.className = 'scanner-result scanner-result--duplicate';
  resultEl.innerHTML = `
    <p class="search-results-kicker">Duplicate book</p>
    <div class="intake-card intake-card--static scanner-hero">
      ${coverMarkup(existing.coverUrl)}
      <div class="intake-card-body">
        <p class="search-result-title">${escapeHtml(existing.title)}</p>
        <p class="search-result-author">${escapeHtml(authorLine(existing))}</p>
        <p class="search-result-meta">Already in your collection</p>
      </div>
    </div>
    <button type="button" class="solid-cta scanner-next" data-scanner-action="ready">Return to scanning</button>
  `;
  bindResultActions();
}

function renderMissing(kind, isbn) {
  const copy = {
    'not-found': 'ISBN not found',
    error: "Couldn't retrieve book information",
    network: 'Network unavailable',
    invalid: 'Invalid ISBN',
  }[kind] || "Couldn't retrieve book information";
  resultEl.hidden = false;
  resultEl.className = 'scanner-result scanner-result--error';
  if (manualForm) manualForm.hidden = true;
  if (stage) stage.hidden = true;
  resultEl.innerHTML = `
    <p class="search-results-kicker">Lookup</p>
    <h2>${escapeHtml(copy)}</h2>
    <p class="lede intake-copy">${isbn?.isbn13 ? `ISBN ${escapeHtml(isbn.isbn13)}` : 'The scanner is still open.'}</p>
    <div class="scanner-actions">
      ${kind === 'error' || kind === 'network'
        ? `<button type="button" class="solid-cta" data-scanner-action="retry">Retry</button>`
        : ''}
      <button type="button" class="ghost-cta" data-scanner-action="ready">Return to scanning</button>
    </div>
  `;
  bindResultActions();
}

function renderConfirm(book) {
  pendingBook = { ...book };
  const covers = uniqueCoverUrls(book);
  selectedCover = covers[0] || null;
  pendingBook.coverUrl = selectedCover;
  const carousel = covers.length > 1
    ? `<div class="cover-carousel" role="listbox" aria-label="Available covers">${
        covers.map((url, i) => `<button type="button" class="cover-carousel-item" role="option" data-cover-url="${escapeHtml(url)}" aria-pressed="${i === 0 ? 'true' : 'false'}">
          <img class="scanner-cover-thumb" src="${escapeHtml(url)}" alt="" width="56" height="84" />
        </button>`).join('')
      }</div>`
    : '';
  resultEl.hidden = false;
  resultEl.className = 'scanner-result scanner-result--new';
  if (manualForm) manualForm.hidden = true;
  if (stage) stage.hidden = true;
  resultEl.innerHTML = `
    <p class="search-results-kicker">New book</p>
    <p class="search-result-title scanner-title">${escapeHtml(book.title)} ${sourceTags(book.source)}</p>
    <p class="search-result-author">${escapeHtml(authorLine(book))}</p>
    <div class="scanner-hero-cover">${coverMarkup(selectedCover)}</div>
    ${carousel}
    <p class="search-result-meta">${escapeHtml([book.publicationYear, book.publisher, book.isbn13 ? `ISBN ${book.isbn13}` : ''].filter(Boolean).join(' · '))}</p>
    <div class="scanner-actions">
      <button type="button" class="solid-cta" data-scanner-action="accept">Accept</button>
      <button type="button" class="ghost-cta" data-scanner-action="reject">Reject</button>
    </div>
  `;
  resultEl.querySelectorAll('[data-cover-url]').forEach((btn) => {
    btn.addEventListener('click', () => selectCover(btn.dataset.coverUrl));
  });
  bindCoverErrors(resultEl);
  bindResultActions();
}

function bindResultActions() {
  resultEl.querySelectorAll('[data-scanner-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.scannerAction;
      if (action === 'ready') returnToReady(pendingBook?.isbn13, 1600);
      if (action === 'retry' && lastLookup) processIsbn(lastLookup, { fromScan: false });
      if (action === 'reject') rejectBook();
      if (action === 'accept') acceptBook();
    });
  });
  sprinkleButtonMotes(resultEl);
}

function returnToReady(isbn13, ignoreMs = 0) {
  busy = false;
  pendingBook = null;
  hideResult();
  setLive('Looking for an ISBN…');
  if (isbn13 && ignoreMs) ignoreIsbn(isbn13, ignoreMs);
  if (stage && scanner?.active) stage.hidden = false;
  scanner?.resume();
}

function rejectBook() {
  const isbn13 = pendingBook?.isbn13;
  returnToReady(isbn13, 4000);
}

async function acceptBook() {
  if (!pendingBook) return;
  const btn = resultEl.querySelector('[data-scanner-action="accept"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }
  try {
    await addToCollection({ ...pendingBook, coverUrl: selectedCover });
    const isbn13 = pendingBook.isbn13;
    toast('Added to collection');
    returnToReady(isbn13, 1400);
  } catch (err) {
    if (err?.duplicate) {
      renderDuplicate(err.duplicate);
      busy = true;
      return;
    }
    toast(err?.message || 'Could not add the book.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Accept';
    }
  }
}

async function processIsbn(raw, { fromScan }) {
  const normalized = normalizeIsbn(raw);
  if (!normalized) {
    if (fromScan) {
      toast(looksLikeBarcode(raw) ? 'Barcode not recognised' : 'Invalid ISBN');
      return;
    }
    busy = true;
    scanner?.pause();
    renderMissing('invalid', null);
    return;
  }
  if (busy || ignored(normalized.canonical)) return;

  busy = true;
  lastLookup = normalized.canonical;
  scanner?.pause();
  hidePermission();

  const localHit = findLocalByIsbn(normalized);
  if (fromScan) {
    if (localHit) playDuplicateBeep();
    else playSuccessBeep();
  }
  if (localHit) {
    renderDuplicate(localHit, { beep: !fromScan });
    return;
  }

  setLive('Looking up ISBN…');
  if (stage) stage.hidden = true;
  if (manualForm) manualForm.hidden = true;
  resultEl.hidden = false;
  resultEl.className = 'scanner-result';
  resultEl.innerHTML = `<p class="search-results-kicker">Looking up</p><p class="lede intake-copy">ISBN ${escapeHtml(normalized.isbn13)}</p>`;

  try {
    const existing = await findInCollection(normalized);
    if (existing) {
      renderDuplicate(existing, { beep: !fromScan });
      return;
    }
    const lookup = await lookupIsbn(normalized.canonical);
    if (lookup.kind === 'found' && lookup.book) {
      renderConfirm(lookup.book);
      return;
    }
    renderMissing(lookup.kind, normalized);
  } catch (err) {
    const kind = typeof navigator !== 'undefined' && navigator.onLine === false ? 'network' : 'error';
    renderMissing(kind, normalized);
  }
}

function onCode(raw) {
  processIsbn(raw, { fromScan: true });
}

function cameraErrorCopy(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      title: 'Camera access blocked',
      copy: 'Scanning cannot work without camera access. Allow the camera for this site in your browser settings, or type the ISBN below.',
      canRetry: false,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      title: 'No camera found',
      copy: 'This device does not have a usable camera. Type the ISBN below to look the book up.',
      canRetry: false,
    };
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return {
      title: 'Camera unavailable',
      copy: 'This page needs a secure browser with camera support. Type the ISBN below if you still want to look a book up.',
      canRetry: false,
    };
  }
  return {
    title: 'Camera access needed',
    copy: 'Allow the camera so ISBN barcodes can be read. The feed stays on this device and is not sent to an AI service.',
    canRetry: true,
  };
}

async function startCamera() {
  if (!video) return;
  unlockBeep();
  hideResult();
  hidePermission();
  setLive('Starting camera…');
  if (!scanner) {
    scanner = createBarcodeScanner({
      video,
      onCode,
      onError: () => {},
    });
  }
  try {
    await scanner.start();
    setCameraGranted(true);
    hidePermission();
    if (stage) stage.hidden = false;
    setLive('Looking for an ISBN…');
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      setCameraGranted(false);
    }
    const info = cameraErrorCopy(err);
    showPermission(info);
    setLive('');
  }
}

export async function startBarcodePanel() {
  if (!panel) return;
  busy = false;
  hideResult();
  let cameraState = '';
  try {
    const perm = await navigator.permissions.query({ name: 'camera' });
    cameraState = perm.state;
  } catch {
    cameraState = '';
  }
  if (cameraState === 'denied') {
    setCameraGranted(false);
    showPermission({
      title: 'Camera access blocked',
      copy: 'Scanning cannot work without camera access. Allow the camera for this site in your browser settings, or type the ISBN below.',
      canRetry: false,
    });
    return;
  }
  await startCamera();
}

export function stopBarcodePanel() {
  busy = false;
  hideResult();
  scanner?.stop();
  scanner = null;
  setLive('');
}

requestBtn?.addEventListener('click', async () => {
  requestBtn.disabled = true;
  try {
    await startCamera();
  } finally {
    requestBtn.disabled = false;
  }
});

closePermissionBtn?.addEventListener('click', () => {
  stopBarcodePanel();
  document.querySelector('[data-intake-method="search"]')?.click();
});

manualForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = String(manualInput?.value || '').trim();
  if (!raw) return;
  processIsbn(raw, { fromScan: false });
});
