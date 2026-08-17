import { searchBooks } from './book-search.js';
import { startBarcodePanel, stopBarcodePanel } from './barcode-intake.js';
import { closeBookPreview, isPreviewOpen, openBookPreview } from './book-preview.js';
import { sprinkleButtonMotes } from '../lib/ember-motes.js';

const overlay = document.getElementById('intake-overlay');
const openBtn = document.getElementById('btn-open-intake');
const closeBtn = document.getElementById('intake-close');
const inputEl = document.getElementById('intake-search');
const searchBtn = document.getElementById('btn-intake-search');
const statusEl = document.getElementById('intake-status');
const listEl = document.getElementById('intake-list');
const selectedEl = document.getElementById('intake-selected');

/** @type {object | null} */
let selectedBook = null;
let lastFullQuery = '';
let fullSeq = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceLabels(source) {
  if (source === 'both') return ['Open Library', 'Google Books'];
  if (source === 'google-books') return ['Google Books'];
  return ['Open Library'];
}

function sourceTags(source) {
  return sourceLabels(source)
    .map((label) => `<span class="source-tag">${escapeHtml(label)}</span>`)
    .join('');
}

function coverHtml(hit, compact = false) {
  const cls = compact ? 'intake-cover intake-cover--sm' : 'intake-cover';
  if (hit.coverUrl) {
    return `<img class="${cls}" src="${escapeHtml(hit.coverUrl)}" alt="" width="${compact ? 36 : 72}" height="${compact ? 52 : 108}" loading="lazy" />`;
  }
  return `<span class="${cls} intake-cover--empty" aria-hidden="true"></span>`;
}

function authorLine(hit) {
  return hit.authors?.length ? hit.authors.join(', ') : 'Unknown author';
}

function metaLine(hit) {
  return [hit.publicationYear, hit.publisher, hit.isbn ? `ISBN ${hit.isbn}` : '']
    .filter(Boolean)
    .join(' · ');
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setMethod(name) {
  closeBookPreview();
  overlay?.querySelectorAll('[data-intake-method]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.intakeMethod === name));
  });
  overlay?.querySelectorAll('[data-intake-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.intakePanel !== name;
  });
  if (name === 'barcode') startBarcodePanel();
  else stopBarcodePanel();
  if (name === 'search' && window.matchMedia('(min-width: 700px)').matches) {
    inputEl?.focus();
  }
}

function openIntake() {
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('intake-open');
  setMethod('search');
}

function closeIntake() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('intake-open');
  closeBookPreview();
  inputEl?.blur();
  stopBarcodePanel();
}

function renderSkeletons(count = 4) {
  if (!listEl) return;
  listEl.innerHTML = Array.from({ length: count }, () => `<li class="search-result-item intake-card is-skeleton" aria-hidden="true">
      <span class="intake-cover intake-cover--empty"></span>
      <div class="intake-card-body">
        <span class="skel-line skel-line--title"></span>
        <span class="skel-line"></span>
        <span class="skel-line skel-line--meta"></span>
      </div>
    </li>`).join('');
}

function renderResults(hits, { empty, bothFailed, errors }) {
  if (!listEl) return;
  if (bothFailed) {
    listEl.innerHTML = '';
    setStatus('Could not reach Open Library or Google Books. Try again in a moment.');
    return;
  }
  if (empty || !hits.length) {
    listEl.innerHTML = '';
    setStatus('No books found');
    return;
  }
  const notes = [];
  if (errors?.googleBooks && hits.some((h) => h.source === 'open-library' || h.source === 'both')) {
    notes.push('Open Library results shown.');
  }
  if (errors?.openLibrary && hits.some((h) => h.source === 'google-books' || h.source === 'both')) {
    notes.push('Google Books results shown.');
  }
  setStatus(`${hits.length} title${hits.length === 1 ? '' : 's'} found${notes.length ? ` · ${notes.join(' ')}` : ''}`);
  listEl.innerHTML = hits
    .map((hit, i) => `<li class="search-result-row">
      <button type="button" class="search-result-item intake-card" data-hit-index="${i}">
        ${coverHtml(hit)}
        <span class="intake-card-body">
          <span class="search-result-title">${escapeHtml(hit.title)} ${sourceTags(hit.source)}</span>
          <span class="search-result-author">${escapeHtml(authorLine(hit))}</span>
          <span class="search-result-meta">${escapeHtml(metaLine(hit) || 'Bibliographic details as returned')}</span>
        </span>
      </button>
      <button type="button" class="intake-add" data-add-index="${i}" aria-label="Add ${escapeHtml(hit.title)}">Add</button>
    </li>`)
    .join('');
  listEl.querySelectorAll('[data-hit-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectHit(hits[Number(btn.dataset.hitIndex)]));
  });
  listEl.querySelectorAll('[data-add-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hit = hits[Number(btn.dataset.addIndex)];
      selectHit(hit);
      openBookPreview(hit);
    });
  });
  sprinkleButtonMotes(listEl);
}

function selectHit(hit) {
  if (!hit) return;
  selectedBook = hit;
  if (!selectedEl) return;
  selectedEl.hidden = false;
  selectedEl.innerHTML = `
    <p class="search-results-kicker">Selected for intake</p>
    <div class="intake-card intake-card--static">
      ${coverHtml(hit)}
      <div class="intake-card-body">
        <p class="search-result-title">${escapeHtml(hit.title)} ${sourceTags(hit.source)}</p>
        <p class="search-result-author">${escapeHtml(authorLine(hit))}</p>
        <p class="search-result-meta">${escapeHtml(metaLine(hit) || 'Ready for the next intake step.')}</p>
      </div>
    </div>
  `;
}

async function runFullSearch(raw) {
  const q = String(raw ?? inputEl?.value ?? '').trim();
  if (q.length < 2) {
    setStatus('Type at least two characters.');
    return;
  }
  lastFullQuery = q;
  const seq = ++fullSeq;
  setStatus('Searching Open Library and Google Books…');
  renderSkeletons();
  const out = await searchBooks(q, { limit: 24 });
  if (seq !== fullSeq) return;
  renderResults(out.results, out);
}

openBtn?.addEventListener('click', openIntake);
closeBtn?.addEventListener('click', closeIntake);
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) closeIntake();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  if (isPreviewOpen()) closeBookPreview();
  else closeIntake();
});

overlay?.querySelectorAll('[data-intake-method]').forEach((btn) => {
  btn.addEventListener('click', () => setMethod(btn.dataset.intakeMethod));
});

const formEl = document.getElementById('intake-form');
formEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  runFullSearch();
});
searchBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  runFullSearch();
});
inputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runFullSearch();
  }
});

window.getSelectedIntakeBook = () => selectedBook;
window.getLastIntakeQuery = () => lastFullQuery;

sprinkleButtonMotes();
