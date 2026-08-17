/**
 * Full catalogue browser — every title in the account as one list, with facet
 * filters and sorting. Rows come from the same account catalogue the shelf
 * search reads, so nothing here needs its own copy of the data.
 */
import config from './config.js';
import { booksUrl, loadAccountCatalogue, restHeaders } from '../lib/account-catalogue.js';
import { forgetLocalByIsbn } from './collection.js';
import { booksToCsv, downloadCsv } from './catalogue-csv.js';

const overlay = document.getElementById('catalogue-overlay');
const openBtn = document.getElementById('btn-open-catalogue');
const openEditBtn = document.getElementById('btn-open-catalogue-edit');
const closeBtn = document.getElementById('catalogue-close');
const editBtn = document.getElementById('catalogue-edit');
const exportCsvBtn = document.getElementById('catalogue-export-csv');
const editNote = document.getElementById('catalogue-edit-note');
const alertEl = document.getElementById('catalogue-alert');
const statusEl = document.getElementById('catalogue-status');
const listEl = document.getElementById('catalogue-list');
const chipsEl = document.getElementById('catalogue-chips');
const moreWrap = document.getElementById('catalogue-more-wrap');
const moreBtn = document.getElementById('catalogue-more');
const toolbarEl = document.getElementById('catalogue-toolbar');
const triggers = {
  filter: document.getElementById('catalogue-filter'),
  sort: document.getElementById('catalogue-sort'),
};
const panels = {
  filter: document.getElementById('catalogue-filter-panel'),
  sort: document.getElementById('catalogue-sort-panel'),
};

const PAGE_SIZE = 60;
/** Long facets stay usable by capping the rendered rows; the find box narrows them. */
const VALUE_CAP = 60;
const FIND_THRESHOLD = 12;
/** Covers land in the public media bucket, downscaled to a jacket-sized JPEG. */
const COVER_BUCKET = 'library-media';
const COVER_EDGE = 640;
const COVER_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** @type {object[] | null} */
let books = null;
/** @type {Promise<object[]> | null} */
let booksPromise = null;
let shown = PAGE_SIZE;
let sortId = 'title-asc';
let openPanel = '';
let activeFacet = 'author';
let valueQuery = '';
let editing = false;
/** Row id awaiting delete confirmation. */
let confirmingId = '';
/** Row ids with a save in flight. */
const pending = new Set();
/** @type {Map<string, Set<string>>} facet id → chosen values */
const chosen = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value) {
  return String(value ?? '').trim();
}

/** Ids round-trip through data attributes as strings, so compare them as strings. */
function rowId(book) {
  return book?.id === null || book?.id === undefined ? '' : String(book.id);
}

/** Author columns hold a joined string; split so each person is its own facet value. */
function splitPeople(value) {
  return text(value)
    .split(/\s*[,;]\s*|\s+&\s+/)
    .map((part) => text(part))
    .filter(Boolean);
}

function listValues(value) {
  if (Array.isArray(value)) return value.map((v) => text(v)).filter(Boolean);
  const one = text(value);
  return one ? [one] : [];
}

function seriesOf(book) {
  return listValues(book.series ?? book.series_name ?? book.series_title);
}

function decadeOf(year) {
  const n = Number(year);
  if (!Number.isFinite(n) || n < 1000) return [];
  return [`${Math.floor(n / 10) * 10}s`];
}

const FACETS = [
  { id: 'author', label: 'Author', valuesOf: (b) => splitPeople(b.author) },
  {
    id: 'series',
    label: 'Series',
    valuesOf: seriesOf,
    emptyNote: 'No series are recorded on these titles yet.',
  },
  {
    id: 'shelf',
    label: 'Shelf',
    soon: true,
    valuesOf: () => [],
    emptyNote: 'Shelf placement is not stored on the catalogue rows yet — coming soon.',
  },
  { id: 'genre', label: 'Genre', valuesOf: (b) => listValues(b.genres) },
  { id: 'format', label: 'Format', valuesOf: (b) => listValues(b.format) },
  { id: 'availability', label: 'Availability', valuesOf: (b) => listValues(b.availability) },
  { id: 'decade', label: 'Decade', valuesOf: (b) => decadeOf(b.year) },
];

function facetById(id) {
  return FACETS.find((facet) => facet.id === id) || FACETS[0];
}

function byText(pick, dir = 1) {
  return (a, b) => dir * collator.compare(text(pick(a)), text(pick(b)));
}

/** Number(null) and Number('') are 0, which would rank blanks as year zero. */
function numberOf(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

/** Missing numbers sort last in both directions so blanks never lead the list. */
function byNumber(pick, dir = 1) {
  return (a, b) => {
    const av = numberOf(pick(a));
    const bv = numberOf(pick(b));
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return dir * (av - bv);
  };
}

function addedAt(book) {
  return Date.parse(book.created_at || book.added_at || book.inserted_at || '');
}

const SORTS = [
  { id: 'title-asc', label: 'Title A–Z', cmp: byText((b) => b.title) },
  { id: 'title-desc', label: 'Title Z–A', cmp: byText((b) => b.title, -1) },
  { id: 'author-asc', label: 'Author A–Z', cmp: byText((b) => b.author) },
  { id: 'author-desc', label: 'Author Z–A', cmp: byText((b) => b.author, -1) },
  { id: 'year-desc', label: 'Year, newest first', cmp: byNumber((b) => b.year, -1) },
  { id: 'year-asc', label: 'Year, oldest first', cmp: byNumber((b) => b.year) },
  {
    id: 'added-desc',
    label: 'Recently added',
    cmp: byNumber(addedAt, -1),
    needs: (rows) => rows.some((row) => Number.isFinite(addedAt(row))),
  },
];

function sortById(id) {
  return SORTS.find((sort) => sort.id === id) || SORTS[0];
}

function chosenFor(facetId) {
  return chosen.get(facetId) || new Set();
}

/** Facet value counts ignore that facet's own picks, so its options never vanish. */
function bookMatches(book, skipFacetId = '') {
  for (const [facetId, values] of chosen) {
    if (!values.size || facetId === skipFacetId) continue;
    const own = facetById(facetId).valuesOf(book);
    if (!own.some((value) => values.has(value))) return false;
  }
  return true;
}

function sortedLibrary() {
  const sort = sortById(sortId);
  return (books || [])
    .slice()
    .sort((a, b) => sort.cmp(a, b) || collator.compare(text(a.title), text(b.title)));
}

function visibleBooks() {
  return sortedLibrary().filter((book) => bookMatches(book));
}

function exportCatalogueCsv() {
  if (!books) {
    setAlert('Reading the catalogue…');
    ensureBooks().then(() => {
      if (books) exportCatalogueCsv();
    });
    return;
  }
  const rows = sortedLibrary();
  downloadCsv(booksToCsv(rows), 'catalogue.csv');
  setAlert(
    rows.length
      ? `Exported ${rows.length} title${rows.length === 1 ? '' : 's'} as CSV.`
      : 'Exported an empty catalogue (header only).',
  );
}

function facetCounts(facet) {
  const counts = new Map();
  for (const book of books || []) {
    if (!bookMatches(book, facet.id)) continue;
    for (const value of facet.valuesOf(book)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

/** Action feedback lives apart from the count line so a re-render cannot wipe it. */
function setAlert(message, kind = 'note') {
  if (!alertEl) return;
  if (!message) {
    alertEl.hidden = true;
    alertEl.textContent = '';
    alertEl.classList.remove('is-error');
    return;
  }
  alertEl.classList.toggle('is-error', kind === 'error');
  // Reveal before writing so the live region actually announces the change.
  alertEl.hidden = false;
  alertEl.textContent = message;
}

function metaLine(book) {
  const genres = Array.isArray(book.genres) ? book.genres.slice(0, 3).join(' · ') : '';
  return [seriesOf(book)[0], book.year, book.format, book.availability, genres]
    .filter(Boolean)
    .join(' · ');
}

/** Visual-only controls, marked so nobody expects them to save anything yet. */
const SOON_ACTIONS = ['Edit details', 'Genres', 'Availability', 'Set shelf', 'Notes'];

function actionsHtml(book) {
  const id = rowId(book);
  if (!id) {
    return '<p class="catalogue-note">This row has no catalogue id, so it cannot be edited here.</p>';
  }
  if (pending.has(id)) {
    return '<p class="catalogue-note">Saving…</p>';
  }
  if (confirmingId === id) {
    return `<p class="catalogue-confirm">Delete “${escapeHtml(text(book.title) || 'Untitled')}” from the catalogue? This cannot be undone.</p>
      <div class="catalogue-actions">
        <button type="button" class="catalogue-danger" data-confirm-delete="${escapeHtml(id)}">Yes, delete it</button>
        <button type="button" class="catalogue-action" data-cancel-delete="${escapeHtml(id)}">Keep it</button>
      </div>`;
  }
  const soon = SOON_ACTIONS
    .map((label) => `<button type="button" class="catalogue-action" disabled>${escapeHtml(label)}<span class="catalogue-soon">soon</span></button>`)
    .join('');
  return `<div class="catalogue-actions">
      <button type="button" class="catalogue-action" data-cover-for="${escapeHtml(id)}">Upload cover</button>
      <button type="button" class="catalogue-action" data-ask-delete="${escapeHtml(id)}">Delete</button>
      ${soon}
    </div>`;
}

function cardHtml(book) {
  const cover = book.cover_url || book.coverUrl;
  const coverHtml = cover
    ? `<img class="intake-cover" src="${escapeHtml(cover)}" alt="" width="72" height="108" loading="lazy" />`
    : '<span class="intake-cover intake-cover--empty" aria-hidden="true"></span>';
  return `<li class="search-result-item catalogue-card">
      ${coverHtml}
      <div class="intake-card-body">
        <p class="search-result-title">${escapeHtml(text(book.title) || 'Untitled')}</p>
        <p class="search-result-author">${escapeHtml(text(book.author) || 'Unknown author')}</p>
        <p class="search-result-meta">${escapeHtml(metaLine(book) || 'No further details recorded')}</p>
        ${editing ? actionsHtml(book) : ''}
      </div>
    </li>`;
}

function renderSkeletons(count = 5) {
  if (!listEl) return;
  listEl.innerHTML = Array.from({ length: count }, () => `<li class="search-result-item catalogue-card is-skeleton" aria-hidden="true">
      <span class="intake-cover intake-cover--empty"></span>
      <div class="intake-card-body">
        <span class="skel-line skel-line--title"></span>
        <span class="skel-line"></span>
        <span class="skel-line skel-line--meta"></span>
      </div>
    </li>`).join('');
  if (moreWrap) moreWrap.hidden = true;
}

function renderList() {
  if (!listEl) return;
  const rows = visibleBooks();
  const slice = rows.slice(0, shown);
  listEl.innerHTML = slice.map(cardHtml).join('');

  const remaining = rows.length - slice.length;
  if (moreWrap) moreWrap.hidden = remaining <= 0;
  if (moreBtn) moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more`;

  const total = (books || []).length;
  if (!total) {
    setStatus('No titles in the catalogue yet.');
    return;
  }
  if (!rows.length) {
    setStatus('No titles match these filters.');
    return;
  }
  const scope = rows.length === total ? '' : ` of ${total}`;
  setStatus(`${rows.length} title${rows.length === 1 ? '' : 's'}${scope} · ${sortById(sortId).label}`);
}

function renderChips() {
  if (!chipsEl) return;
  const chips = [];
  for (const facet of FACETS) {
    for (const value of chosenFor(facet.id)) {
      chips.push(`<button type="button" class="catalogue-chip" data-drop-facet="${facet.id}" data-drop-value="${escapeHtml(value)}" aria-label="Remove filter ${escapeHtml(`${facet.label}: ${value}`)}">
          <span class="catalogue-chip-facet">${escapeHtml(facet.label)}</span>
          <span>${escapeHtml(value)}</span>
          <span aria-hidden="true">×</span>
        </button>`);
    }
  }
  chipsEl.hidden = !chips.length;
  chipsEl.innerHTML = chips.length
    ? `${chips.join('')}<button type="button" class="catalogue-clear" data-clear-all>Clear all</button>`
    : '';
  syncTriggerState();
}

function syncTriggerState() {
  let count = 0;
  for (const values of chosen.values()) count += values.size;
  triggers.filter?.classList.toggle('has-filters', count > 0);
}

function valuesHtml(facet) {
  if (facet.soon) {
    return `<p class="catalogue-note">${escapeHtml(facet.emptyNote)}</p>`;
  }
  if (!books) {
    return '<p class="catalogue-note">Reading the catalogue…</p>';
  }
  const entries = facetCounts(facet);
  if (!entries.length) {
    return `<p class="catalogue-note">${escapeHtml(facet.emptyNote || `Nothing is recorded for ${facet.label.toLowerCase()} yet.`)}</p>`;
  }
  const needle = valueQuery.trim().toLowerCase();
  const matching = needle
    ? entries.filter(([value]) => value.toLowerCase().includes(needle))
    : entries;
  if (!matching.length) {
    return '<p class="catalogue-note">Nothing matches that.</p>';
  }
  const picked = chosenFor(facet.id);
  const capped = matching.slice(0, VALUE_CAP);
  const rows = capped
    .map(([value, count]) => `<button type="button" class="catalogue-value" data-value="${escapeHtml(value)}" aria-pressed="${picked.has(value)}">
        <span>${escapeHtml(value)}</span>
        <span class="catalogue-count">${count}</span>
      </button>`)
    .join('');
  const note = matching.length > capped.length
    ? `<p class="catalogue-note">Showing ${capped.length} of ${matching.length} — type above to narrow.</p>`
    : '';
  return `<div class="catalogue-values">${rows}</div>${note}`;
}

function renderFilterPanel() {
  if (!panels.filter) return;
  const facet = facetById(activeFacet);
  const tabs = FACETS
    .map((item) => {
      const dot = chosenFor(item.id).size ? '<span class="catalogue-dot" aria-hidden="true"></span>' : '';
      const soon = item.soon ? '<span class="catalogue-soon">soon</span>' : '';
      return `<button type="button" class="catalogue-facet" data-facet="${item.id}" aria-pressed="${item.id === facet.id}">${escapeHtml(item.label)}${soon}${dot}</button>`;
    })
    .join('');
  const showFind = !facet.soon && facetCounts(facet).length > FIND_THRESHOLD;
  const find = showFind
    ? `<input type="search" class="catalogue-find" placeholder="Find a ${escapeHtml(facet.label.toLowerCase())}…" value="${escapeHtml(valueQuery)}" autocomplete="off" spellcheck="false" aria-label="Find a ${escapeHtml(facet.label.toLowerCase())}" />`
    : '';

  panels.filter.innerHTML = `
    <div class="catalogue-facets">${tabs}</div>
    ${find}
    <div class="catalogue-value-box">${valuesHtml(facet)}</div>
    <div class="catalogue-panel-foot">
      <button type="button" class="catalogue-clear" data-clear-all>Clear all filters</button>
    </div>
  `;
}

/** Repaint only the value rows so the find box keeps focus and caret. */
function renderFacetValues() {
  const box = panels.filter?.querySelector('.catalogue-value-box');
  if (box) box.innerHTML = valuesHtml(facetById(activeFacet));
}

function renderSortPanel() {
  if (!panels.sort) return;
  const rows = books || [];
  panels.sort.innerHTML = `<div class="catalogue-sorts">${SORTS
    .filter((sort) => !sort.needs || sort.needs(rows))
    .map((sort) => `<button type="button" class="catalogue-value" data-sort="${sort.id}" aria-pressed="${sort.id === sortId}">
        <span>${escapeHtml(sort.label)}</span>
      </button>`)
    .join('')}</div>`;
}

function setPanel(name) {
  openPanel = name;
  for (const key of Object.keys(panels)) {
    const on = key === name;
    if (panels[key]) panels[key].hidden = !on;
    triggers[key]?.setAttribute('aria-expanded', String(on));
  }
  if (name === 'filter') renderFilterPanel();
  if (name === 'sort') renderSortPanel();
}

function closePanels() {
  if (openPanel) setPanel('');
}

function afterFilterChange() {
  shown = PAGE_SIZE;
  renderChips();
  renderList();
}

function toggleValue(facetId, value) {
  const values = chosen.get(facetId) || new Set();
  if (values.has(value)) values.delete(value);
  else values.add(value);
  if (values.size) chosen.set(facetId, values);
  else chosen.delete(facetId);
}

function writeUrl(id) {
  const url = booksUrl(config);
  if (!url || !config?.supabaseAnonKey) throw new Error('Catalogue is not configured.');
  return `${url}?id=eq.${encodeURIComponent(id)}`;
}

/**
 * PostgREST answers a row-level-security refusal with 200 and an empty body,
 * so an empty representation has to be treated as a failure, not a success.
 */
async function writeRow(id, method, body) {
  const res = await fetch(writeUrl(id), {
    method,
    headers: restHeaders(config, {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Prefer: 'return=representation',
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const rows = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(rows?.message || rows?.error || `The catalogue refused the change (${res.status}).`);
  }
  if (Array.isArray(rows) && !rows.length) {
    throw new Error('The catalogue did not apply that change — the account may not have permission.');
  }
  return Array.isArray(rows) ? rows[0] : rows;
}

function readImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

async function toCoverBlob(file) {
  const image = await readImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw new Error('That image could not be read.');
  const scale = Math.min(1, COVER_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('That image could not be prepared.'))),
      'image/jpeg',
      COVER_QUALITY,
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be prepared.'));
    reader.readAsDataURL(blob);
  });
}

/** A fresh filename each time keeps the CDN from serving the previous jacket. */
async function uploadToBucket(id, blob) {
  const root = String(config?.supabaseUrl || '').replace(/\/$/, '');
  if (!root || !config?.supabaseAnonKey) return '';
  const path = `covers/${encodeURIComponent(id)}-${Date.now()}.jpg`;
  const res = await fetch(`${root}/storage/v1/object/${COVER_BUCKET}/${path}`, {
    method: 'POST',
    headers: restHeaders(config, { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
    body: blob,
  });
  return res.ok ? `${root}/storage/v1/object/public/${COVER_BUCKET}/${path}` : '';
}

async function uploadCover(id, file) {
  const book = (books || []).find((row) => rowId(row) === id);
  if (!book || pending.has(id)) return;
  if (!file.type.startsWith('image/')) {
    setAlert('Pick an image file for the cover.', 'error');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setAlert('That image is too large — try one under 12 MB.', 'error');
    return;
  }
  pending.add(id);
  setAlert('Preparing the cover…');
  renderList();
  try {
    const blob = await toCoverBlob(file);
    // Bucket first; if media storage is unavailable the jacket rides along on the row.
    const cover = (await uploadToBucket(id, blob)) || (await blobToDataUrl(blob));
    const saved = await writeRow(id, 'PATCH', { cover_url: cover });
    book.cover_url = saved?.cover_url || cover;
    setAlert(`New cover saved for “${text(book.title) || 'Untitled'}”.`);
  } catch (err) {
    setAlert(err?.message || 'Could not save that cover.', 'error');
  } finally {
    pending.delete(id);
    renderList();
  }
}

async function deleteBook(id) {
  const book = (books || []).find((row) => rowId(row) === id);
  if (!book || pending.has(id)) return;
  const title = text(book.title) || 'Untitled';
  confirmingId = '';
  pending.add(id);
  setAlert(`Removing “${title}”…`);
  renderList();
  try {
    await writeRow(id, 'DELETE');
    books = (books || []).filter((row) => rowId(row) !== id);
    forgetLocalByIsbn(book.isbn || book.isbn13);
    setAlert(`Removed “${title}” from the catalogue.`);
  } catch (err) {
    setAlert(err?.message || 'Could not delete that title.', 'error');
  } finally {
    pending.delete(id);
    renderChips();
    renderList();
    if (openPanel === 'filter') renderFilterPanel();
  }
}

function setEditing(on) {
  editing = Boolean(on);
  confirmingId = '';
  editBtn?.setAttribute('aria-pressed', String(editing));
  if (editBtn) editBtn.textContent = editing ? 'Done editing' : 'Edit';
  if (editNote) editNote.hidden = !editing;
  if (!editing) setAlert('');
  if (books) renderList();
}

function loadBooks() {
  if (!booksPromise) {
    booksPromise = loadAccountCatalogue(config).then((out) => (Array.isArray(out?.books) ? out.books : []));
  }
  return booksPromise;
}

async function ensureBooks() {
  if (books) return;
  renderSkeletons();
  setStatus('Reading the catalogue…');
  try {
    books = await loadBooks();
  } catch (err) {
    booksPromise = null;
    if (listEl) listEl.innerHTML = '';
    if (moreWrap) moreWrap.hidden = true;
    setStatus(err?.message || 'Could not reach the catalogue.');
    return;
  }
  renderChips();
  renderList();
  if (openPanel) setPanel(openPanel);
}

function openCatalogue(withEdit = false) {
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('catalogue-open');
  closePanels();
  setAlert('');
  if (withEdit || editing) setEditing(true);
  ensureBooks();
}

function closeCatalogue() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('catalogue-open');
  closePanels();
  confirmingId = '';
}

openBtn?.addEventListener('click', () => openCatalogue(false));
openEditBtn?.addEventListener('click', () => openCatalogue(true));
closeBtn?.addEventListener('click', closeCatalogue);
editBtn?.addEventListener('click', () => {
  closePanels();
  setEditing(!editing);
});
exportCsvBtn?.addEventListener('click', () => {
  closePanels();
  exportCatalogueCsv();
});
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) closeCatalogue();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  if (openPanel) closePanels();
  else if (confirmingId) {
    confirmingId = '';
    renderList();
  } else closeCatalogue();
});

for (const [key, trigger] of Object.entries(triggers)) {
  trigger?.addEventListener('click', () => setPanel(openPanel === key ? '' : key));
}

document.addEventListener('click', (e) => {
  if (!openPanel || !overlay || overlay.hidden) return;
  if (!toolbarEl?.contains(e.target)) closePanels();
});

panels.filter?.addEventListener('click', (e) => {
  const facetBtn = e.target.closest('[data-facet]');
  if (facetBtn) {
    activeFacet = facetBtn.dataset.facet;
    valueQuery = '';
    renderFilterPanel();
    return;
  }
  const valueBtn = e.target.closest('[data-value]');
  if (valueBtn) {
    toggleValue(activeFacet, valueBtn.dataset.value);
    valueBtn.setAttribute('aria-pressed', String(chosenFor(activeFacet).has(valueBtn.dataset.value)));
    afterFilterChange();
    return;
  }
  if (e.target.closest('[data-clear-all]')) {
    chosen.clear();
    valueQuery = '';
    renderFilterPanel();
    afterFilterChange();
  }
});

panels.filter?.addEventListener('input', (e) => {
  if (!e.target.classList.contains('catalogue-find')) return;
  valueQuery = e.target.value;
  renderFacetValues();
});

panels.sort?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sort]');
  if (!btn) return;
  sortId = btn.dataset.sort;
  shown = PAGE_SIZE;
  renderSortPanel();
  renderList();
});

chipsEl?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-drop-facet]');
  if (chip) {
    toggleValue(chip.dataset.dropFacet, chip.dataset.dropValue);
    if (openPanel === 'filter') renderFilterPanel();
    afterFilterChange();
    return;
  }
  if (e.target.closest('[data-clear-all]')) {
    chosen.clear();
    if (openPanel === 'filter') renderFilterPanel();
    afterFilterChange();
  }
});

moreBtn?.addEventListener('click', () => {
  shown += PAGE_SIZE;
  renderList();
});

/** One file picker for the whole list, so row re-renders never lose it. */
const coverInput = document.createElement('input');
coverInput.type = 'file';
coverInput.accept = 'image/*';
coverInput.hidden = true;
let coverTargetId = '';
document.body.appendChild(coverInput);

coverInput.addEventListener('change', () => {
  const file = coverInput.files?.[0];
  const id = coverTargetId;
  coverInput.value = '';
  coverTargetId = '';
  if (file && id) uploadCover(id, file);
});

listEl?.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-cover-for]');
  if (pick) {
    coverTargetId = pick.dataset.coverFor;
    coverInput.click();
    return;
  }
  const ask = e.target.closest('[data-ask-delete]');
  if (ask) {
    confirmingId = ask.dataset.askDelete;
    setAlert('');
    renderList();
    // Land on the safe choice — the button under the cursor has just been replaced.
    listEl.querySelector('[data-cancel-delete]')?.focus();
    return;
  }
  const cancel = e.target.closest('[data-cancel-delete]');
  if (cancel) {
    const back = cancel.dataset.cancelDelete;
    confirmingId = '';
    renderList();
    [...listEl.querySelectorAll('[data-ask-delete]')]
      .find((btn) => btn.dataset.askDelete === back)
      ?.focus();
    return;
  }
  const go = e.target.closest('[data-confirm-delete]');
  if (go) deleteBook(go.dataset.confirmDelete);
});
