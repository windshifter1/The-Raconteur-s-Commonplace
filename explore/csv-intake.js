/**
 * CSV intake for Add Books: upload a spreadsheet, keep its data or refresh every
 * row against Open Library (Google Books as fallback), review and edit the batch,
 * then write it into the catalogue.
 */
import config from './config.js';
import { loadAccountCatalogue } from '../lib/account-catalogue.js';
import { sprinkleButtonMotes } from '../lib/ember-motes.js';
import { coverFileError, makeCoverUrl } from '../lib/cover-image.js';
import { lookupIsbn } from './book-lookup.js';
import { searchBooks } from './book-search.js';
import { insertBooks } from './collection.js';
import { normalizeIsbn } from './isbn.js';
import {
  applyLookup,
  draftToPayload,
  draftsFromCsv,
  hitToBook,
  pickBestHit,
  splitAuthors,
  titleAuthorKey,
  yearFrom,
} from './csv-mapping.js';

const panel = document.querySelector('[data-intake-panel="csv"]');
const fileInput = document.getElementById('csv-file');
const chooseBtn = document.getElementById('csv-choose');
const dropZone = document.getElementById('csv-drop');
const pickStatus = document.getElementById('csv-status');
const stages = {
  pick: document.getElementById('csv-stage-pick'),
  mode: document.getElementById('csv-stage-mode'),
  review: document.getElementById('csv-stage-review'),
  done: document.getElementById('csv-stage-done'),
};
const modeSummary = document.getElementById('csv-mode-summary');
const keepBtn = document.getElementById('csv-mode-keep');
const refreshBtn = document.getElementById('csv-mode-refresh');
const modeBackBtn = document.getElementById('csv-mode-back');
const reviewStatus = document.getElementById('csv-review-status');
const progressWrap = document.getElementById('csv-progress');
const progressBar = document.getElementById('csv-progress-bar');
const progressText = document.getElementById('csv-progress-text');
const stopBtn = document.getElementById('csv-stop');
const listEl = document.getElementById('csv-list');
const moreWrap = document.getElementById('csv-more-wrap');
const moreBtn = document.getElementById('csv-more');
const commitBtn = document.getElementById('csv-commit');
const restartBtn = document.getElementById('csv-restart');
const doneSummary = document.getElementById('csv-done-summary');
const doneAgainBtn = document.getElementById('csv-done-again');

const PAGE_SIZE = 12;
const REFRESH_WORKERS = 4;
const FORMAT_OPTIONS = ['paperback', 'hardcover', 'ebook', 'other'];

/** @type {object[]} */
let drafts = [];
let shown = PAGE_SIZE;
let fileName = '';
let parseNote = '';
let refreshing = false;
let stopRequested = false;
let committing = false;
let coverTarget = -1;

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

function setStage(name) {
  for (const [key, el] of Object.entries(stages)) {
    if (el) el.hidden = key !== name;
  }
}

function sourceTags(source) {
  const labels = source === 'both'
    ? ['Open Library', 'Google Books']
    : source === 'google-books'
      ? ['Google Books']
      : source === 'open-library'
        ? ['Open Library']
        : ['From CSV'];
  return labels.map((label) => `<span class="source-tag">${escapeHtml(label)}</span>`).join('');
}

function coverMarkup(url) {
  if (url) {
    return `<img class="intake-cover scanner-cover" src="${escapeHtml(url)}" alt="" width="120" height="180" />`;
  }
  return '<span class="intake-cover scanner-cover intake-cover--empty" aria-hidden="true"></span>';
}

function coverOptionsHtml(draft, index) {
  if (draft.covers.length < 2) return '';
  return `<div class="cover-carousel" role="listbox" aria-label="Available covers">${draft.covers
    .map((item) => `<button type="button" class="cover-carousel-item" role="option" data-row="${index}" data-cover-url="${escapeHtml(item.url)}" aria-pressed="${item.url === draft.coverUrl}" title="${escapeHtml(item.source)}">
        <img class="scanner-cover-thumb" src="${escapeHtml(item.url)}" alt="" width="56" height="84" />
      </button>`)
    .join('')}</div>`;
}

function cardCoverHtml(draft, index) {
  return `
    <div class="csv-hero">${coverMarkup(draft.coverUrl)}</div>
    ${coverOptionsHtml(draft, index)}
    <button type="button" class="catalogue-action csv-cover-btn" data-csv-cover="${index}">Upload cover</button>
  `;
}

function fieldsHtml(draft, index) {
  const formats = FORMAT_OPTIONS
    .map((value) => `<option value="${value}"${value === draft.format ? ' selected' : ''}>${value}</option>`)
    .join('');
  return `
    <label class="csv-field csv-field--wide">
      <span>Title</span>
      <input type="text" data-row="${index}" data-field="title" value="${escapeHtml(draft.title)}" placeholder="Untitled" />
    </label>
    <label class="csv-field csv-field--wide">
      <span>Author(s)</span>
      <input type="text" data-row="${index}" data-field="author" value="${escapeHtml(draft.author)}" placeholder="Unknown author" />
    </label>
    <div class="csv-field-grid">
      <label class="csv-field">
        <span>Year</span>
        <input type="text" inputmode="numeric" data-row="${index}" data-field="year" value="${escapeHtml(draft.year ?? '')}" placeholder="—" />
      </label>
      <label class="csv-field">
        <span>Publisher</span>
        <input type="text" data-row="${index}" data-field="publisher" value="${escapeHtml(draft.publisher ?? '')}" placeholder="—" />
      </label>
      <label class="csv-field">
        <span>ISBN</span>
        <input type="text" data-row="${index}" data-field="isbn" value="${escapeHtml(draft.isbn ?? '')}" placeholder="—" />
      </label>
      <label class="csv-field">
        <span>Format</span>
        <select data-row="${index}" data-field="format">${formats}</select>
      </label>
    </div>
    <label class="csv-field csv-field--wide">
      <span>Description</span>
      <textarea rows="3" data-row="${index}" data-field="description" placeholder="—">${escapeHtml(draft.description ?? '')}</textarea>
    </label>
  `;
}

function cardInnerHtml(draft, index) {
  const note = draft.note
    ? `<p class="csv-note">${escapeHtml(draft.note)}</p>`
    : '';
  return `
    <div class="csv-card-cover" data-cover-slot="${index}">${cardCoverHtml(draft, index)}</div>
    <div class="csv-card-body">
      <p class="csv-card-head">
        <span class="csv-index">${index + 1}</span>
        ${sourceTags(draft.source)}
      </p>
      ${note}
      ${fieldsHtml(draft, index)}
      <div class="csv-card-actions">
        <button type="button" class="catalogue-action" data-csv-refresh="${index}">Refresh this row</button>
        <button type="button" class="catalogue-action" data-csv-remove="${index}">Remove</button>
      </div>
    </div>
  `;
}

function renderList() {
  if (!listEl) return;
  const slice = drafts.slice(0, shown);
  listEl.innerHTML = slice
    .map((draft, index) => `<li class="csv-card" data-card="${index}">${cardInnerHtml(draft, index)}</li>`)
    .join('');
  const remaining = drafts.length - slice.length;
  if (moreWrap) moreWrap.hidden = remaining <= 0;
  if (moreBtn) moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more`;
  sprinkleButtonMotes(listEl);
  syncReviewStatus();
}

/** Repaint one card so edits elsewhere keep their caret. */
function replaceCard(index) {
  const li = listEl?.querySelector(`[data-card="${index}"]`);
  const draft = drafts[index];
  if (!li || !draft) return;
  li.innerHTML = cardInnerHtml(draft, index);
  sprinkleButtonMotes(li);
}

function replaceCardCover(index) {
  const slot = listEl?.querySelector(`[data-cover-slot="${index}"]`);
  const draft = drafts[index];
  if (!slot || !draft) return;
  slot.innerHTML = cardCoverHtml(draft, index);
}

function setCardNote(index, message) {
  const draft = drafts[index];
  if (!draft) return;
  draft.note = message;
  const li = listEl?.querySelector(`[data-card="${index}"]`);
  const body = li?.querySelector('.csv-card-body');
  if (!body) return;
  let note = body.querySelector('.csv-note');
  if (!message) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement('p');
    note.className = 'csv-note';
    body.querySelector('.csv-card-head')?.after(note);
  }
  note.textContent = message;
}

function syncReviewStatus() {
  if (!reviewStatus) return;
  if (refreshing) return;
  const shownCount = Math.min(shown, drafts.length);
  const scope = shownCount < drafts.length ? ` · showing ${shownCount}` : '';
  reviewStatus.textContent = drafts.length
    ? `${drafts.length} book${drafts.length === 1 ? '' : 's'} ready from ${fileName}${scope}${parseNote ? ` · ${parseNote}` : ''}`
    : 'Nothing left in this batch.';
  if (commitBtn) {
    commitBtn.disabled = !drafts.length || committing;
    commitBtn.textContent = drafts.length
      ? `Add ${drafts.length} book${drafts.length === 1 ? '' : 's'} to catalogue`
      : 'Add to catalogue';
    // Writing textContent drops the mote layer, so put it back.
    sprinkleButtonMotes(commitBtn.parentElement || undefined);
  }
}

function setProgress(done, total, label) {
  if (progressWrap) progressWrap.hidden = false;
  if (progressBar) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressBar.style.width = `${pct}%`;
    progressBar.parentElement?.setAttribute('aria-valuenow', String(pct));
  }
  if (progressText) progressText.textContent = label || `${done} of ${total}`;
}

function hideProgress() {
  if (progressWrap) progressWrap.hidden = true;
  if (stopBtn) stopBtn.hidden = true;
}

/* ── Parsing ── */

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    // Force UTF-8 so accented and non-Latin titles survive the trip.
    reader.readAsText(file, 'UTF-8');
  });
}

async function handleFile(file) {
  if (!file) return;
  const name = String(file.name || 'file.csv');
  if (!/\.csv$/i.test(name) && file.type !== 'text/csv') {
    if (pickStatus) pickStatus.textContent = 'Pick a .csv file exported from a spreadsheet.';
    return;
  }
  if (pickStatus) pickStatus.textContent = `Reading ${name}…`;
  let text = '';
  try {
    text = await readFile(file);
  } catch (err) {
    if (pickStatus) pickStatus.textContent = err?.message || 'That file could not be read.';
    return;
  }

  const out = draftsFromCsv(text);
  if (!out.drafts.length) {
    if (pickStatus) {
      pickStatus.textContent = out.columns.length
        ? 'No usable rows found — every row needs at least a title or an ISBN.'
        : 'No recognisable columns found. A header row with title and author is the minimum.';
    }
    return;
  }

  drafts = out.drafts;
  fileName = name;
  shown = PAGE_SIZE;
  const notes = [];
  if (out.skipped) notes.push(`${out.skipped} row${out.skipped === 1 ? '' : 's'} skipped as empty`);
  if (out.unknown.length) notes.push(`ignored column${out.unknown.length === 1 ? '' : 's'}: ${out.unknown.slice(0, 4).join(', ')}`);
  parseNote = notes.join(' · ');

  if (modeSummary) {
    modeSummary.innerHTML = `
      <p class="csv-file-line">${escapeHtml(name)}</p>
      <p class="search-results-status">${escapeHtml(`${drafts.length} book${drafts.length === 1 ? '' : 's'} found · columns read: ${out.columns.join(', ')}${parseNote ? ` · ${parseNote}` : ''}`)}</p>
    `;
  }
  setStage('mode');
}

/* ── Refresh against Open Library, then Google Books ── */

async function refreshDraft(draft) {
  const normalized = normalizeIsbn(draft.isbn);
  if (normalized) {
    const out = await lookupIsbn(normalized.canonical);
    if (out.kind === 'found' && out.book) return applyLookup(draft, out.book);
  }
  const query = [draft.title, draft.authors[0] || ''].filter(Boolean).join(' ').trim();
  if (query.length >= 2) {
    const out = await searchBooks(query, { limit: 12 });
    const hit = pickBestHit(out.results, draft);
    if (hit) {
      const hitIsbn = normalizeIsbn(hit.isbn);
      if (hitIsbn) {
        const full = await lookupIsbn(hitIsbn.canonical);
        if (full.kind === 'found' && full.book) return applyLookup(draft, full.book);
      }
      return applyLookup(draft, hitToBook(hit));
    }
  }
  return { ...draft, refreshed: false, note: 'No match found — kept the data from your CSV.' };
}

async function runRefresh() {
  refreshing = true;
  stopRequested = false;
  if (stopBtn) stopBtn.hidden = false;
  if (listEl) listEl.innerHTML = '';
  if (moreWrap) moreWrap.hidden = true;
  if (commitBtn) commitBtn.disabled = true;
  if (reviewStatus) reviewStatus.textContent = `Refreshing ${drafts.length} book${drafts.length === 1 ? '' : 's'} — Open Library first, Google Books as fallback.`;

  const total = drafts.length;
  let done = 0;
  setProgress(0, total, `0 of ${total}`);
  const queue = drafts.map((_, index) => index);

  const worker = async () => {
    while (queue.length && !stopRequested) {
      const index = queue.shift();
      try {
        drafts[index] = await refreshDraft(drafts[index]);
      } catch {
        drafts[index] = { ...drafts[index], note: 'Lookup failed — kept the data from your CSV.' };
      }
      done += 1;
      setProgress(done, total, `${done} of ${total}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(REFRESH_WORKERS, total) }, worker));

  const matched = drafts.filter((draft) => draft.refreshed).length;
  refreshing = false;
  hideProgress();
  renderList();
  if (reviewStatus) {
    const stoppedNote = stopRequested ? ' · stopped early' : '';
    reviewStatus.textContent = `${matched} of ${total} refreshed from Open Library / Google Books${stoppedNote} · ${fileName}`;
  }
  if (commitBtn) commitBtn.disabled = !drafts.length;
}

async function refreshOne(index) {
  const draft = drafts[index];
  if (!draft || refreshing) return;
  setCardNote(index, 'Looking this one up…');
  try {
    drafts[index] = await refreshDraft(draft);
  } catch {
    drafts[index] = { ...draft, note: 'Lookup failed — kept the data from your CSV.' };
  }
  replaceCard(index);
}

/* ── Review interactions ── */

function updateField(index, field, value) {
  const draft = drafts[index];
  if (!draft) return;
  if (field === 'year') {
    draft.year = yearFrom(value);
  } else if (field === 'author') {
    draft.author = value;
    draft.authors = splitAuthors(value);
  } else if (field === 'format') {
    draft.format = value;
    draft.isDigital = value === 'ebook';
  } else {
    draft[field] = value;
  }
}

function selectCover(index, url) {
  const draft = drafts[index];
  if (!draft) return;
  draft.coverUrl = url;
  replaceCardCover(index);
}

async function uploadCoverFor(index, file) {
  const draft = drafts[index];
  if (!draft) return;
  const problem = coverFileError(file);
  if (problem) {
    setCardNote(index, problem);
    return;
  }
  setCardNote(index, 'Preparing the cover…');
  try {
    const url = await makeCoverUrl(config, file, draft.title || `row-${index + 1}`);
    draft.covers = [{ url, source: 'upload' }, ...draft.covers.filter((item) => item.url !== url)];
    draft.coverUrl = url;
    setCardNote(index, 'Cover ready — it saves with the book.');
    replaceCardCover(index);
  } catch (err) {
    setCardNote(index, err?.message || 'That cover could not be prepared.');
  }
}

function removeRow(index) {
  drafts.splice(index, 1);
  if (shown > PAGE_SIZE && shown > drafts.length) shown = Math.max(PAGE_SIZE, drafts.length);
  renderList();
}

/* ── Commit ── */

async function existingIndex() {
  const index = { isbns: new Set(), ids: new Set(), titles: new Set() };
  try {
    const out = await loadAccountCatalogue(config);
    for (const row of out?.books || []) {
      if (row.id) index.ids.add(String(row.id));
      const normalized = normalizeIsbn(row.isbn);
      if (normalized) index.isbns.add(normalized.canonical);
      index.titles.add(titleAuthorKey(row.title, row.author));
    }
  } catch {
    // A failed read must not block intake; duplicates get caught on the next pass.
  }
  return index;
}

async function commitBatch() {
  if (committing || !drafts.length) return;
  committing = true;
  if (commitBtn) {
    commitBtn.disabled = true;
    commitBtn.textContent = 'Checking the catalogue…';
  }

  const index = await existingIndex();
  const seenIsbn = new Set();
  const seenTitle = new Set();
  const keep = [];
  let duplicates = 0;

  for (const draft of drafts) {
    const normalized = normalizeIsbn(draft.isbn);
    const canonical = normalized?.canonical || '';
    const key = titleAuthorKey(draft.title, draft.author);
    const already = (draft.csvId && index.ids.has(draft.csvId))
      || (canonical && (index.isbns.has(canonical) || seenIsbn.has(canonical)))
      || (!canonical && (index.titles.has(key) || seenTitle.has(key)));
    if (already) {
      duplicates += 1;
      continue;
    }
    if (canonical) seenIsbn.add(canonical);
    else seenTitle.add(key);
    keep.push(draft);
  }

  if (!keep.length) {
    committing = false;
    showDone({ added: 0, duplicates, failed: [] });
    return;
  }

  setProgress(0, keep.length, `0 of ${keep.length}`);
  if (reviewStatus) reviewStatus.textContent = `Adding ${keep.length} book${keep.length === 1 ? '' : 's'} to the catalogue…`;

  let result = { inserted: [], failed: [] };
  try {
    result = await insertBooks(keep.map(draftToPayload), {
      onProgress: (done, total) => setProgress(done, total, `${done} of ${total}`),
    });
  } catch (err) {
    committing = false;
    hideProgress();
    if (commitBtn) commitBtn.disabled = false;
    if (reviewStatus) reviewStatus.textContent = err?.message || 'Could not reach the catalogue.';
    syncReviewStatus();
    return;
  }

  committing = false;
  hideProgress();
  if (result.inserted.length) {
    window.dispatchEvent(new CustomEvent('trc:catalogue-changed'));
  }
  showDone({ added: result.inserted.length, duplicates, failed: result.failed });
}

function showDone({ added, duplicates, failed }) {
  const lines = [
    `${added} book${added === 1 ? '' : 's'} added to the catalogue.`,
    duplicates ? `${duplicates} skipped — already in the catalogue.` : '',
    failed.length ? `${failed.length} could not be saved.` : '',
  ].filter(Boolean);
  const errors = [...new Set(failed.map((item) => item.message))].slice(0, 3);
  if (doneSummary) {
    doneSummary.innerHTML = `
      <h2>${added ? 'Intake complete' : 'Nothing new to add'}</h2>
      <p class="lede intake-copy">${escapeHtml(lines.join(' '))}</p>
      ${errors.length ? `<p class="csv-note">${escapeHtml(errors.join(' · '))}</p>` : ''}
    `;
  }
  drafts = [];
  setStage('done');
}

function resetPanel() {
  drafts = [];
  shown = PAGE_SIZE;
  fileName = '';
  parseNote = '';
  stopRequested = false;
  committing = false;
  if (fileInput) fileInput.value = '';
  if (listEl) listEl.innerHTML = '';
  hideProgress();
  if (pickStatus) pickStatus.textContent = 'No file chosen yet.';
  setStage('pick');
}

/* ── Wiring ── */

chooseBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

dropZone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-over');
});
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
dropZone?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('is-over');
  handleFile(e.dataTransfer?.files?.[0]);
});

keepBtn?.addEventListener('click', () => {
  setStage('review');
  hideProgress();
  renderList();
  if (reviewStatus) reviewStatus.textContent = `${drafts.length} book${drafts.length === 1 ? '' : 's'} ready from ${fileName} — data kept exactly as the CSV had it.`;
});

refreshBtn?.addEventListener('click', () => {
  setStage('review');
  runRefresh();
});

modeBackBtn?.addEventListener('click', resetPanel);
restartBtn?.addEventListener('click', resetPanel);
doneAgainBtn?.addEventListener('click', resetPanel);
stopBtn?.addEventListener('click', () => {
  stopRequested = true;
  if (stopBtn) stopBtn.hidden = true;
});
moreBtn?.addEventListener('click', () => {
  shown += PAGE_SIZE;
  renderList();
});
commitBtn?.addEventListener('click', commitBatch);

listEl?.addEventListener('input', (e) => {
  const el = e.target.closest('[data-field]');
  if (!el) return;
  updateField(Number(el.dataset.row), el.dataset.field, el.value);
  if (el.dataset.field === 'title' || el.dataset.field === 'author') syncReviewStatus();
});

listEl?.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-field]');
  if (!el) return;
  updateField(Number(el.dataset.row), el.dataset.field, el.value);
});

listEl?.addEventListener('click', (e) => {
  const cover = e.target.closest('[data-cover-url]');
  if (cover) {
    selectCover(Number(cover.dataset.row), cover.dataset.coverUrl);
    return;
  }
  const pick = e.target.closest('[data-csv-cover]');
  if (pick) {
    coverTarget = Number(pick.dataset.csvCover);
    coverInput.click();
    return;
  }
  const again = e.target.closest('[data-csv-refresh]');
  if (again) {
    refreshOne(Number(again.dataset.csvRefresh));
    return;
  }
  const remove = e.target.closest('[data-csv-remove]');
  if (remove) removeRow(Number(remove.dataset.csvRemove));
});

coverInput.addEventListener('change', () => {
  const file = coverInput.files?.[0];
  const index = coverTarget;
  coverInput.value = '';
  coverTarget = -1;
  if (file && index >= 0) uploadCoverFor(index, file);
});

document.body.appendChild(coverInput);
if (panel) sprinkleButtonMotes(panel);
