import { debounce, searchBooks } from './book-search.js';
import { startBarcodePanel, stopBarcodePanel } from './barcode-intake.js';

const overlay = document.getElementById('intake-overlay');
const openBtn = document.getElementById('btn-open-intake');
const closeBtn = document.getElementById('intake-close');
const inputEl = document.getElementById('intake-search');
const searchBtn = document.getElementById('btn-intake-search');
const suggestEl = document.getElementById('intake-suggest');
const statusEl = document.getElementById('intake-status');
const listEl = document.getElementById('intake-list');
const selectedEl = document.getElementById('intake-selected');
const suggestBusy = document.getElementById('intake-suggest-busy');

/** @type {object | null} */
let selectedBook = null;
let lastFullQuery = '';
let suggestSeq = 0;
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

function hideSuggest() {
  if (!suggestEl) return;
  suggestEl.hidden = true;
  suggestEl.innerHTML = '';
}

function setMethod(name) {
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
  hideSuggest();
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
    .map((hit, i) => `<li>
      <button type="button" class="search-result-item intake-card" data-hit-index="${i}">
        ${coverHtml(hit)}
        <span class="intake-card-body">
          <span class="search-result-title">${escapeHtml(hit.title)} ${sourceTags(hit.source)}</span>
          <span class="search-result-author">${escapeHtml(authorLine(hit))}</span>
          <span class="search-result-meta">${escapeHtml(metaLine(hit) || 'Bibliographic details as returned')}</span>
        </span>
      </button>
    </li>`)
    .join('');
  listEl.querySelectorAll('[data-hit-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectHit(hits[Number(btn.dataset.hitIndex)]));
  });
}

function renderSuggest(hits) {
  if (!suggestEl) return;
  if (!hits.length) {
    hideSuggest();
    return;
  }
  suggestEl.hidden = false;
  suggestEl.innerHTML = hits
    .slice(0, 8)
    .map((hit, i) => `<button type="button" class="intake-suggest-item" data-suggest-index="${i}">
        ${coverHtml(hit, true)}
        <span>
          <span class="search-result-title">${escapeHtml(hit.title)} ${sourceTags(hit.source)}</span>
          <span class="search-result-author">${escapeHtml(authorLine(hit))}</span>
        </span>
      </button>`)
    .join('');
  suggestEl.querySelectorAll('[data-suggest-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hit = hits[Number(btn.dataset.suggestIndex)];
      if (inputEl) inputEl.value = hit.title;
      hideSuggest();
      selectHit(hit);
      runFullSearch(hit.title);
    });
  });
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
  hideSuggest();
  const seq = ++fullSeq;
  setStatus('Searching Open Library and Google Books…');
  renderSkeletons();
  const out = await searchBooks(q, { limit: 24 });
  if (seq !== fullSeq) return;
  renderResults(out.results, out);
}

async function runSuggest(raw) {
  const q = String(raw ?? '').trim();
  if (q.length < 2) {
    hideSuggest();
    if (suggestBusy) suggestBusy.hidden = true;
    return;
  }
  const seq = ++suggestSeq;
  if (suggestBusy) suggestBusy.hidden = false;
  const out = await searchBooks(q, { limit: 8 });
  if (seq !== suggestSeq) return;
  if (suggestBusy) suggestBusy.hidden = true;
  if (q === String(inputEl?.value || '').trim()) renderSuggest(out.results);
}

const onTyped = debounce(() => runSuggest(inputEl?.value), 300);

openBtn?.addEventListener('click', openIntake);
closeBtn?.addEventListener('click', closeIntake);
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) closeIntake();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay && !overlay.hidden) closeIntake();
});

overlay?.querySelectorAll('[data-intake-method]').forEach((btn) => {
  btn.addEventListener('click', () => setMethod(btn.dataset.intakeMethod));
});

const formEl = document.getElementById('intake-form');
formEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  hideSuggest();
  runFullSearch();
});
searchBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  hideSuggest();
  runFullSearch();
});
inputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    hideSuggest();
    runFullSearch();
  }
});
inputEl?.addEventListener('input', onTyped);
inputEl?.addEventListener('search', () => {
  if (!String(inputEl.value || '').trim()) hideSuggest();
});

window.getSelectedIntakeBook = () => selectedBook;
window.getLastIntakeQuery = () => lastFullQuery;
