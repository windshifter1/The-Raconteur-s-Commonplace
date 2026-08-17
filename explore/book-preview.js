/**
 * Save preview for a search result: the same accept/reject moment as the barcode
 * scanner, with every field editable and a cover carousel you can add to.
 */
import config from './config.js';
import { sprinkleButtonMotes } from '../lib/ember-motes.js';
import { coverFileError, makeCoverUrl } from '../lib/cover-image.js';
import { lookupIsbn } from './book-lookup.js';
import { findInCollection, insertBooks } from './collection.js';
import { applyLookup, draftToPayload, hitToBook } from './csv-mapping.js';
import { coverPickerHtml, withUploadedCover } from './cover-picker.js';
import { applyFieldEdit, intakeFieldsHtml, sourceTagsHtml } from './intake-fields.js';
import { normalizeIsbn } from './isbn.js';

const panel = document.querySelector('[data-intake-panel="search"]');
const previewEl = document.getElementById('intake-preview');

/** @type {object | null} */
let draft = null;
/** @type {'edit' | 'duplicate' | 'saved'} */
let stage = 'edit';
/** @type {object | null} */
let duplicate = null;
let note = '';
let busy = false;
let edited = false;
let openSeq = 0;
/** @type {HTMLElement | null} */
let returnFocus = null;

const coverInput = document.createElement('input');
coverInput.type = 'file';
coverInput.accept = 'image/*';
coverInput.hidden = true;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function draftFromHit(hit) {
  const base = {
    title: '',
    author: '',
    authors: [],
    isbn: null,
    year: null,
    publisher: null,
    description: null,
    coverUrl: null,
    covers: [],
    format: 'paperback',
    isDigital: false,
    genres: [],
    tags: ['intake', 'search'],
    keywords: 'search intake',
    availability: 'available',
    source: 'open-library',
    refreshed: false,
    note: '',
  };
  return applyLookup(base, hitToBook(hit));
}

function metaLine(draft) {
  return [draft.year, draft.publisher, draft.isbn ? `ISBN ${draft.isbn}` : '']
    .filter(Boolean)
    .join(' · ');
}

function coverThumbHtml(url) {
  if (url) {
    return `<img class="intake-cover" src="${escapeHtml(url)}" alt="" width="72" height="108" />`;
  }
  return '<span class="intake-cover intake-cover--empty" aria-hidden="true"></span>';
}

function noteHtml() {
  return note ? `<p class="intake-note" role="status">${escapeHtml(note)}</p>` : '';
}

function editHtml() {
  return `
    <p class="search-results-kicker">Save this book</p>
    <div class="intake-preview-grid">
      <div class="intake-preview-cover">${coverPickerHtml({ covers: draft.covers, selected: draft.coverUrl })}</div>
      <div class="intake-preview-body">
        <p class="intake-tag-row">${sourceTagsHtml(draft.source)}</p>
        ${noteHtml()}
        ${intakeFieldsHtml(draft)}
      </div>
    </div>
    <div class="scanner-actions">
      <button type="button" class="solid-cta" data-preview-action="accept">Accept</button>
      <button type="button" class="ghost-cta" data-preview-action="reject">Reject</button>
    </div>
  `;
}

function settledHtml({ kicker, title, author, meta, coverUrl }) {
  return `
    <p class="search-results-kicker">${escapeHtml(kicker)}</p>
    <div class="intake-card intake-card--static">
      ${coverThumbHtml(coverUrl)}
      <div class="intake-card-body">
        <p class="search-result-title">${escapeHtml(title)}</p>
        <p class="search-result-author">${escapeHtml(author)}</p>
        <p class="search-result-meta">${escapeHtml(meta)}</p>
      </div>
    </div>
    ${noteHtml()}
    <div class="scanner-actions">
      <button type="button" class="solid-cta" data-preview-action="reject">Back to results</button>
    </div>
  `;
}

function render() {
  if (!previewEl) return;
  if (!draft) {
    previewEl.hidden = true;
    previewEl.innerHTML = '';
    panel?.classList.remove('is-previewing');
    return;
  }
  previewEl.hidden = false;
  panel?.classList.add('is-previewing');
  previewEl.className = `scanner-result intake-preview scanner-result--${stage === 'duplicate' ? 'duplicate' : 'new'}`;
  if (stage === 'duplicate') {
    previewEl.innerHTML = settledHtml({
      kicker: 'Duplicate book',
      title: duplicate?.title || draft.title,
      author: duplicate?.author || draft.author || 'Unknown author',
      meta: 'Already in your collection',
      coverUrl: duplicate?.coverUrl || draft.coverUrl,
    });
  } else if (stage === 'saved') {
    previewEl.innerHTML = settledHtml({
      kicker: 'Added to the catalogue',
      title: draft.title,
      author: draft.author || 'Unknown author',
      meta: metaLine(draft) || 'Saved with the details shown.',
      coverUrl: draft.coverUrl,
    });
  } else {
    previewEl.innerHTML = editHtml();
  }
  sprinkleButtonMotes(previewEl);
}

function renderNote() {
  if (!previewEl || !draft) return;
  const existing = previewEl.querySelector('.intake-note');
  if (!note) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = note;
    return;
  }
  const el = document.createElement('p');
  el.className = 'intake-note';
  el.setAttribute('role', 'status');
  previewEl.querySelector('.intake-tag-row')?.after(el);
  el.textContent = note;
}

function renderCover() {
  const slot = previewEl?.querySelector('.intake-preview-cover');
  if (!slot || !draft) return;
  slot.innerHTML = coverPickerHtml({ covers: draft.covers, selected: draft.coverUrl });
  sprinkleButtonMotes(slot);
}

function setAcceptLabel(label, disabled) {
  const btn = previewEl?.querySelector('[data-preview-action="accept"]');
  if (!btn) return;
  btn.disabled = disabled;
  btn.textContent = label;
  sprinkleButtonMotes(previewEl);
}

export function isPreviewOpen() {
  return Boolean(draft);
}

export function closeBookPreview() {
  openSeq += 1;
  const wasOpen = Boolean(draft);
  draft = null;
  duplicate = null;
  note = '';
  busy = false;
  edited = false;
  stage = 'edit';
  render();
  if (wasOpen && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

/**
 * @param {object} hit search result row
 */
export async function openBookPreview(hit) {
  if (!hit || !previewEl) return;
  const seq = ++openSeq;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  draft = draftFromHit(hit);
  duplicate = null;
  stage = 'edit';
  busy = false;
  edited = false;
  note = '';
  render();
  previewEl.focus({ preventScroll: true });
  previewEl.scrollIntoView({ block: 'nearest' });

  const normalized = normalizeIsbn(hit.isbn);
  if (!normalized) return;
  note = 'Fetching the full record…';
  renderNote();
  const out = await lookupIsbn(normalized.canonical);
  // A reader who already accepted (or is mid-save) must not be pulled back to the form.
  if (seq !== openSeq || !draft || stage !== 'edit' || busy) return;
  if (out.kind === 'found' && out.book) {
    const merged = applyLookup(draft, out.book);
    if (edited) {
      // Keep what the reader has typed; only the jacket choices are new.
      draft = { ...draft, covers: merged.covers, coverUrl: draft.coverUrl || merged.coverUrl };
      note = 'Extra covers found for this edition.';
      renderCover();
      renderNote();
    } else {
      draft = merged;
      note = '';
      render();
    }
    return;
  }
  note = out.kind === 'not-found'
    ? 'Only the search listing was available for this edition.'
    : 'Could not reach the lookup service — the search listing is shown.';
  renderNote();
}

async function uploadCover(file) {
  if (!draft) return;
  const problem = coverFileError(file);
  if (problem) {
    note = problem;
    renderNote();
    return;
  }
  note = 'Preparing the cover…';
  renderNote();
  try {
    const url = await makeCoverUrl(config, file, draft.title || 'cover');
    draft = withUploadedCover(draft, url);
    note = 'Cover ready — it saves with the book.';
    renderCover();
    renderNote();
  } catch (err) {
    note = err?.message || 'Could not prepare that image.';
    renderNote();
  }
}

async function accept() {
  if (!draft || busy) return;
  busy = true;
  const normalized = normalizeIsbn(draft.isbn);
  try {
    if (normalized) {
      setAcceptLabel('Checking…', true);
      const existing = await findInCollection(normalized);
      if (existing) {
        duplicate = existing;
        stage = 'duplicate';
        busy = false;
        note = '';
        render();
        return;
      }
    }
    setAcceptLabel('Saving…', true);
    const { inserted, failed } = await insertBooks([draftToPayload(draft)]);
    if (!inserted.length) throw new Error(failed[0]?.message || 'Could not add the book.');
    draft = { ...draft, ...(inserted[0]?.cover_url ? { coverUrl: inserted[0].cover_url } : {}) };
    stage = 'saved';
    busy = false;
    note = '';
    render();
    window.dispatchEvent(new CustomEvent('trc:catalogue-changed'));
  } catch (err) {
    busy = false;
    note = err?.message || 'Could not add the book.';
    setAcceptLabel('Accept', false);
    renderNote();
  }
}

previewEl?.addEventListener('input', (e) => {
  const el = e.target.closest('[data-field]');
  if (!el || !draft) return;
  edited = true;
  applyFieldEdit(draft, el.dataset.field, el.value);
});

previewEl?.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-field]');
  if (!el || !draft) return;
  edited = true;
  applyFieldEdit(draft, el.dataset.field, el.value);
});

previewEl?.addEventListener('click', (e) => {
  const cover = e.target.closest('[data-cover-url]');
  if (cover && draft) {
    draft.coverUrl = cover.dataset.coverUrl;
    renderCover();
    return;
  }
  if (e.target.closest('[data-cover-pick]')) {
    coverInput.value = '';
    coverInput.click();
    return;
  }
  const action = e.target.closest('[data-preview-action]')?.dataset.previewAction;
  if (action === 'accept') accept();
  if (action === 'reject') closeBookPreview();
});

coverInput.addEventListener('change', () => {
  const file = coverInput.files?.[0];
  if (file) uploadCover(file);
});

document.body.appendChild(coverInput);
