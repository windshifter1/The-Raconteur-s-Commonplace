/**
 * Catalogue search against the Supabase books table (public read).
 */
import config from './config.js';

const resultsEl = document.getElementById('search-results');
const statusEl = document.getElementById('search-status');
const listEl = document.getElementById('search-list');
const inputEl = document.getElementById('search');
const searchBtn = document.getElementById('btn-search');
const closeBtn = document.getElementById('search-close');

/** @type {Promise<object[]>|null} */
let booksPromise = null;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function showResults() {
  if (resultsEl) resultsEl.hidden = false;
}

function hideResults() {
  if (resultsEl) resultsEl.hidden = true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchBooks() {
  const url = config.supabaseUrl;
  const key = config.supabaseAnonKey;
  if (!url || !key) {
    throw new Error('Catalogue is not configured. Run npm run build:full with .env set.');
  }
  const res = await fetch(`${url}/rest/v1/books?select=*&order=title.asc`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Catalogue request failed (${res.status}).`);
  return res.json();
}

function loadBooks() {
  if (!booksPromise) booksPromise = fetchBooks();
  return booksPromise;
}

function matchesQuery(book, q) {
  if (!q) return true;
  const hay = [
    book.title,
    book.author,
    book.description || '',
    book.keywords || '',
    Array.isArray(book.genres) ? book.genres.join(' ') : '',
    book.format || '',
    book.publisher || '',
    book.isbn || '',
    book.availability || '',
    book.year != null ? String(book.year) : '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function renderBooks(books) {
  if (!listEl) return;
  if (!books.length) {
    listEl.innerHTML = '';
    setStatus('No titles matched that search.');
    return;
  }
  setStatus(`${books.length} title${books.length === 1 ? '' : 's'} found`);
  listEl.innerHTML = books
    .slice(0, 40)
    .map((book) => {
      const genres = Array.isArray(book.genres) ? book.genres.slice(0, 3).join(' · ') : '';
      const meta = [book.format, book.year, book.availability].filter(Boolean).join(' · ');
      return `<li class="search-result-item">
        <p class="search-result-title">${escapeHtml(book.title)}</p>
        <p class="search-result-author">${escapeHtml(book.author || 'Unknown author')}</p>
        <p class="search-result-meta">${escapeHtml(meta)}${genres ? ` · ${escapeHtml(genres)}` : ''}</p>
      </li>`;
    })
    .join('');
}

export async function runSearch(rawQuery) {
  const q = String(rawQuery || '')
    .trim()
    .toLowerCase();
  showResults();
  if (!q) {
    listEl.innerHTML = '';
    setStatus('Type a title, author, or keyword.');
    return;
  }
  setStatus('Searching the commonplace…');
  listEl.innerHTML = '';
  try {
    const books = await loadBooks();
    renderBooks(books.filter((b) => matchesQuery(b, q)));
  } catch (err) {
    booksPromise = null;
    listEl.innerHTML = '';
    setStatus(err?.message || 'Could not reach the catalogue.');
  }
}

export function bindSearchUi() {
  if (!inputEl || !searchBtn) return;
  const go = () => runSearch(inputEl.value);
  searchBtn.addEventListener('click', go);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });
  closeBtn?.addEventListener('click', hideResults);
}
