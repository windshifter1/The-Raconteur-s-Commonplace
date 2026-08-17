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
import { coverPickerHtml, withUploadedCover } from './cover-picker.js';
import { applyFieldEdit, intakeFieldsHtml, sourceTagsHtml } from './intake-fields.js';
import { normalizeIsbn } from './isbn.js';
import {
  applyLookup,
  draftToPayload,
  draftsFromCsv,
  hitToBook,
  matchChoices,
  titleAuthorKey,
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
const REFRESH_WORKERS = 8;
/** A batch cannot wait on a stalled query the way one impatient reader can. */
const BATCH_BUDGET = { timeoutMs: 9000, tries: 2 };

/** @type {object[]} */
let drafts = [];
let shown = PAGE_SIZE;
let fileName = '';
let parseNote = '';
let refreshing = false;
let stopRequested = false;
let committing = false;
let coverTarget = -1;
let refreshNote = '';
let enriching = false;
let enrichToken = 0;

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

function cardCoverHtml(draft, index) {
  return coverPickerHtml({ covers: draft.covers, selected: draft.coverUrl, row: index });
}

function hitMeta(hit) {
  return [hit.publicationYear, hit.publisher, hit.isbn ? `ISBN ${hit.isbn}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** Shortlist for a row whose match was too close to call. */
function choiceHtml(draft, index) {
  if (!draft.ambiguous || !draft.candidates?.length) return '';
  const options = draft.candidates.map((hit, which) => `<li>
      <button type="button" class="csv-choice-item" data-csv-choose="${index}" data-candidate="${which}">
        ${hit.coverUrl
          ? `<img class="intake-cover intake-cover--sm" src="${escapeHtml(hit.coverUrl)}" alt="" width="36" height="52" loading="lazy" />`
          : '<span class="intake-cover intake-cover--sm intake-cover--empty" aria-hidden="true"></span>'}
        <span class="csv-choice-lines">
          <span class="search-result-title">${escapeHtml(hit.title)} ${sourceTagsHtml(hit.source)}</span>
          <span class="search-result-author">${escapeHtml(hit.authors?.join(', ') || 'Unknown author')}</span>
          <span class="search-result-meta">${escapeHtml(hitMeta(hit) || 'No edition details given')}</span>
        </span>
      </button>
    </li>`).join('');
  return `
    <div class="csv-choice" role="group" aria-label="Choose an edition for ${escapeHtml(draft.title || 'this row')}">
      <p class="csv-choice-head"><span class="csv-flag">Needs a choice</span> Similar titles matched — pick the one you own.</p>
      <ul class="csv-choice-list">${options}</ul>
      <button type="button" class="catalogue-action" data-csv-keep="${index}">None of these — keep my CSV row</button>
    </div>
  `;
}

function cardInnerHtml(draft, index) {
  const note = draft.note
    ? `<p class="intake-note">${escapeHtml(draft.note)}</p>`
    : '';
  return `
    <div class="csv-card-cover" data-cover-slot="${index}">${cardCoverHtml(draft, index)}</div>
    <div class="csv-card-body">
      ${choiceHtml(draft, index)}
      <p class="intake-tag-row">
        <span class="csv-index">${index + 1}</span>
        ${sourceTagsHtml(draft.source)}
      </p>
      ${note}
      ${intakeFieldsHtml(draft, index)}
      <div class="csv-card-actions">
        <button type="button" class="catalogue-action" data-csv-refresh="${index}">Refresh this row</button>
        <button type="button" class="catalogue-action" data-csv-remove="${index}">Remove</button>
      </div>
    </div>
  `;
}

/**
 * Rows waiting on a choice come first; everything else keeps its CSV order, so a
 * settled row drops straight back to where the spreadsheet had it.
 */
function viewOrder() {
  const flagged = [];
  const rest = [];
  drafts.forEach((draft, index) => (draft.ambiguous ? flagged : rest).push(index));
  return [...flagged, ...rest];
}

function renderList() {
  if (!listEl) return;
  const order = viewOrder();
  const slice = order.slice(0, shown);
  listEl.innerHTML = slice
    .map((index) => `<li class="csv-card${drafts[index].ambiguous ? ' csv-card--flagged' : ''}" data-card="${index}">${cardInnerHtml(drafts[index], index)}</li>`)
    .join('');
  const remaining = order.length - slice.length;
  if (moreWrap) moreWrap.hidden = remaining <= 0;
  if (moreBtn) moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more`;
  sprinkleButtonMotes(listEl);
  syncReviewStatus();
}

/** Keep a row on screen after it moves back into its natural position. */
function revealRow(index) {
  const position = viewOrder().indexOf(index);
  if (position < 0 || position < shown) return;
  shown = Math.min(drafts.length, Math.ceil((position + 1) / PAGE_SIZE) * PAGE_SIZE);
  renderList();
}

/** Repaint one card so edits elsewhere keep their caret. */
function replaceCard(index) {
  const li = listEl?.querySelector(`[data-card="${index}"]`);
  const draft = drafts[index];
  if (!li || !draft) return;
  li.innerHTML = cardInnerHtml(draft, index);
  sprinkleButtonMotes(li);
}

/** Fold late-arriving details into a card without disturbing what is being typed. */
function patchCardDetails(index) {
  const li = listEl?.querySelector(`[data-card="${index}"]`);
  const draft = drafts[index];
  if (!li || !draft) return;
  for (const el of li.querySelectorAll('[data-field]')) {
    if (el === document.activeElement) continue;
    const field = el.dataset.field;
    el.value = field === 'year' ? (draft.year ?? '') : (draft[field] ?? '');
  }
  replaceCardCover(index);
  setCardNote(index, draft.note || '');
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
  let note = body.querySelector('.intake-note');
  if (!message) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement('p');
    note.className = 'intake-note';
    body.querySelector('.intake-tag-row')?.after(note);
  }
  note.textContent = message;
}

function pendingChoices() {
  return drafts.filter((draft) => draft.ambiguous).length;
}

function syncReviewStatus() {
  if (!reviewStatus) return;
  if (refreshing) return;
  const shownCount = Math.min(shown, drafts.length);
  const pending = pendingChoices();
  const bits = drafts.length
    ? [
      `${drafts.length} book${drafts.length === 1 ? '' : 's'} ready from ${fileName}`,
      refreshNote,
      pending ? `${pending} need${pending === 1 ? 's' : ''} a choice` : '',
      enriching ? 'filling in details…' : '',
      shownCount < drafts.length ? `showing ${shownCount}` : '',
      parseNote,
    ]
    : ['Nothing left in this batch.'];
  reviewStatus.textContent = bits.filter(Boolean).join(' · ');
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

/**
 * First pass: one request per row, which is all the review list needs. Rows matched by
 * title carry a shortlist so a close call can be settled by the reader; blurbs and the
 * rest of the jackets arrive in the second pass.
 */
async function matchDraft(draft) {
  const normalized = normalizeIsbn(draft.isbn);
  let stalled = false;
  if (normalized) {
    const out = await lookupIsbn(normalized.canonical, BATCH_BUDGET);
    if (out.kind === 'found' && out.book) {
      return { ...applyLookup(draft, out.book), ambiguous: false, candidates: [], detailed: true };
    }
    stalled = Boolean(out.timedOut);
  }
  const query = [draft.title, draft.authors[0] || ''].filter(Boolean).join(' ').trim();
  if (query.length >= 2) {
    const out = await searchBooks(query, { limit: 12, ...BATCH_BUDGET });
    const { best, candidates, ambiguous } = matchChoices(out.results, draft);
    if (best) {
      return {
        ...applyLookup(draft, hitToBook(best)),
        ambiguous,
        candidates: ambiguous ? candidates : [],
        // Flagged rows keep their spreadsheet values, in case the reader wants them back.
        original: ambiguous ? draft : null,
        detailed: false,
        note: '',
      };
    }
    stalled = stalled || Boolean(out.timedOut);
  }
  return {
    ...draft,
    refreshed: false,
    ambiguous: false,
    candidates: [],
    detailed: true,
    note: stalled
      ? 'The lookup service was too slow — kept the data from your CSV.'
      : 'No match found — kept the data from your CSV.',
  };
}

/** Second pass: the full record for a row matched by title, for its blurb and jackets. */
async function detailDraft(draft) {
  const normalized = normalizeIsbn(draft.isbn);
  if (!normalized) return { ...draft, detailed: true };
  const out = await lookupIsbn(normalized.canonical, BATCH_BUDGET);
  if (out.kind !== 'found' || !out.book) return { ...draft, detailed: true };
  const merged = applyLookup(draft, out.book);
  // A jacket already chosen for this row stays chosen.
  return { ...merged, coverUrl: draft.coverUrl || merged.coverUrl, detailed: true, note: draft.note };
}

async function runRefresh() {
  refreshing = true;
  stopRequested = false;
  refreshNote = '';
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
        drafts[index] = await matchDraft(drafts[index]);
      } catch {
        drafts[index] = { ...drafts[index], detailed: true, note: 'Lookup failed — kept the data from your CSV.' };
      }
      done += 1;
      setProgress(done, total, `${done} of ${total}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(REFRESH_WORKERS, total) }, worker));

  const matched = drafts.filter((draft) => draft.refreshed).length;
  refreshing = false;
  hideProgress();
  refreshNote = `${matched} of ${total} refreshed from Open Library / Google Books${stopRequested ? ' · stopped early' : ''}`;
  renderList();
  if (commitBtn) commitBtn.disabled = !drafts.length;
  if (!stopRequested) runEnrichment();
}

/** Fill in blurbs and extra jackets while the reader looks over the batch. */
async function runEnrichment() {
  const token = ++enrichToken;
  const queue = drafts
    .map((_, index) => index)
    .filter((index) => !drafts[index].detailed && !drafts[index].ambiguous && !drafts[index].edited);
  const total = queue.length;
  if (!total) return;

  enriching = true;
  stopRequested = false;
  if (stopBtn) stopBtn.hidden = false;
  let done = 0;
  setProgress(0, total, `details · 0 of ${total}`);

  const worker = async () => {
    while (queue.length && !stopRequested && token === enrichToken) {
      const index = queue.shift();
      const before = drafts[index];
      if (!before) continue;
      try {
        const next = await detailDraft(before);
        // Skip rows the reader has since edited, replaced, or removed.
        if (token === enrichToken && drafts[index] === before && !before.edited) {
          drafts[index] = next;
          patchCardDetails(index);
        }
      } catch {
        if (drafts[index] === before) drafts[index] = { ...before, detailed: true };
      }
      done += 1;
      setProgress(done, total, `details · ${done} of ${total}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(REFRESH_WORKERS, total) }, worker));
  if (token !== enrichToken) return;
  enriching = false;
  hideProgress();
  syncReviewStatus();
}

function cancelEnrichment() {
  enrichToken += 1;
  enriching = false;
}

async function refreshOne(index) {
  const draft = drafts[index];
  if (!draft || refreshing) return;
  setCardNote(index, 'Looking this one up…');
  try {
    const matched = await matchDraft(draft);
    drafts[index] = matched.detailed ? matched : await detailDraft(matched);
  } catch {
    drafts[index] = { ...draft, note: 'Lookup failed — kept the data from your CSV.' };
  }
  if (Boolean(drafts[index].ambiguous) !== Boolean(draft.ambiguous)) {
    renderList();
    revealRow(index);
    return;
  }
  replaceCard(index);
}

/** Apply the edition the reader picked, then let the row settle back into place. */
async function chooseCandidate(index, which) {
  const draft = drafts[index];
  const hit = draft?.candidates?.[which];
  if (!hit) return;
  drafts[index] = {
    ...applyLookup(draft, hitToBook(hit)),
    ambiguous: false,
    candidates: [],
    original: null,
    detailed: false,
    note: 'Edition chosen.',
  };
  renderList();
  revealRow(index);
  const chosen = drafts[index];
  try {
    const full = await detailDraft(chosen);
    if (drafts[index] === chosen && !chosen.edited) {
      drafts[index] = full;
      patchCardDetails(index);
    }
  } catch {
    // The listing we already applied is enough; details can be fetched again by hand.
  }
}

/** None of the matches fit: put the spreadsheet's own values back. */
function keepCsvRow(index) {
  const draft = drafts[index];
  if (!draft) return;
  drafts[index] = {
    ...(draft.original || draft),
    ambiguous: false,
    candidates: [],
    original: null,
    detailed: true,
    refreshed: false,
    note: 'Kept your CSV row.',
  };
  renderList();
  revealRow(index);
}

/* ── Review interactions ── */

function updateField(index, field, value) {
  const draft = applyFieldEdit(drafts[index], field, value);
  // Once a row is touched by hand, background detail passes leave it alone.
  if (draft) draft.edited = true;
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
    drafts[index] = withUploadedCover(drafts[index], url);
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
  cancelEnrichment();
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
      ${errors.length ? `<p class="intake-note">${escapeHtml(errors.join(' · '))}</p>` : ''}
    `;
  }
  drafts = [];
  setStage('done');
}

function resetPanel() {
  cancelEnrichment();
  drafts = [];
  shown = PAGE_SIZE;
  fileName = '';
  parseNote = '';
  refreshNote = '';
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
  refreshNote = 'data kept exactly as the CSV had it';
  renderList();
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
  const pick = e.target.closest('[data-cover-pick]');
  if (pick) {
    coverTarget = Number(pick.dataset.coverPick);
    coverInput.click();
    return;
  }
  const again = e.target.closest('[data-csv-refresh]');
  if (again) {
    refreshOne(Number(again.dataset.csvRefresh));
    return;
  }
  const choose = e.target.closest('[data-csv-choose]');
  if (choose) {
    chooseCandidate(Number(choose.dataset.csvChoose), Number(choose.dataset.candidate));
    return;
  }
  const keep = e.target.closest('[data-csv-keep]');
  if (keep) {
    keepCsvRow(Number(keep.dataset.csvKeep));
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
