/**
 * Local + catalogue collection for intake duplicates and ACCEPT.
 * Catalogue rows live in public.books; recently accepted scans also cache locally.
 */
import config from './config.js';
import { isbnKeys, matchesIsbn, normalizeIsbn } from './isbn.js';

const STORAGE_KEY = 'trc-intake-collection';

function restHeaders() {
  const key = config.supabaseAnonKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function booksUrl() {
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  return base ? `${base}/rest/v1/books` : '';
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-400)));
}

function asRecord(row) {
  if (!row) return null;
  const authors = Array.isArray(row.authors)
    ? row.authors
    : String(row.author || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  const isbn = row.isbn13 || row.isbn || null;
  return {
    id: row.id || null,
    title: row.title || '',
    authors,
    author: authors.join(', ') || String(row.author || ''),
    isbn,
    isbn10: row.isbn10 || null,
    isbn13: row.isbn13 || isbn,
    coverUrl: row.coverUrl || row.cover_url || null,
    publicationYear: row.publicationYear || row.year || null,
    publisher: row.publisher || null,
    description: row.description || null,
  };
}

export function findLocalByIsbn(normalized) {
  if (!normalized) return null;
  for (const row of readLocal()) {
    if (
      matchesIsbn(row.isbn, normalized) ||
      matchesIsbn(row.isbn13, normalized) ||
      matchesIsbn(row.isbn10, normalized)
    ) {
      return asRecord(row);
    }
  }
  return null;
}

function cacheLocal(record) {
  const rows = readLocal().filter((row) => {
    const n = normalizeIsbn(row.isbn13 || row.isbn);
    return !n || n.canonical !== record.isbn13;
  });
  rows.push({
    id: record.id,
    title: record.title,
    authors: record.authors,
    author: record.author,
    isbn: record.isbn13,
    isbn10: record.isbn10,
    isbn13: record.isbn13,
    coverUrl: record.coverUrl,
    publicationYear: record.publicationYear,
    publisher: record.publisher,
    description: record.description,
    addedAt: Date.now(),
  });
  writeLocal(rows);
}

async function findRemoteByIsbn(normalized) {
  const url = booksUrl();
  const key = config.supabaseAnonKey;
  if (!url || !key) return null;
  const keys = isbnKeys(normalized);
  const orParts = keys.map((k) => `isbn.eq.${encodeURIComponent(k)}`);
  const exactUrl = `${url}?select=id,title,author,isbn,cover_url,year,publisher,description&or=(${orParts.join(',')})`;
  const exactRes = await fetch(exactUrl, { headers: restHeaders() });
  if (exactRes.ok) {
    const rows = await exactRes.json();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (matchesIsbn(row.isbn, normalized)) return asRecord(row);
      }
    }
  } else if (exactRes.status >= 500) {
    throw new Error(`Catalogue lookup failed (${exactRes.status}).`);
  }

  const scanUrl = `${url}?select=id,title,author,isbn,cover_url,year,publisher,description&isbn=not.is.null&limit=2000`;
  const scanRes = await fetch(scanUrl, { headers: restHeaders() });
  if (!scanRes.ok) throw new Error(`Catalogue lookup failed (${scanRes.status}).`);
  const rows = await scanRes.json();
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (matchesIsbn(row.isbn, normalized)) return asRecord(row);
  }
  return null;
}

/**
 * Local cache first, then public.books. Same ISBN-10/13 pair counts as one edition.
 */
export async function findInCollection(normalized) {
  const local = findLocalByIsbn(normalized);
  if (local) return local;
  return findRemoteByIsbn(normalized);
}

export async function addToCollection(book) {
  const normalized = normalizeIsbn(book.isbn13 || book.isbn);
  if (!normalized) throw new Error('Cannot add a book without a valid ISBN.');
  const existing = await findInCollection(normalized);
  if (existing) {
    const err = new Error('Already in your collection');
    err.duplicate = existing;
    throw err;
  }

  const payload = {
    title: String(book.title || '').trim() || 'Untitled',
    author: (book.authors || []).join(', ') || 'Unknown author',
    format: 'paperback',
    is_digital: false,
    isbn: normalized.isbn13,
    year: book.publicationYear || null,
    publisher: book.publisher || null,
    description: book.description || null,
    cover_url: book.coverUrl || null,
    availability: 'available',
    keywords: 'intake, barcode',
    tags: ['intake', 'barcode'],
  };

  const url = booksUrl();
  if (!url) throw new Error('Catalogue is not configured.');
  const res = await fetch(url, {
    method: 'POST',
    headers: restHeaders(),
    body: JSON.stringify(payload),
  });
  const rows = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(rows?.message || rows?.error || `Could not add the book (${res.status}).`);
  }
  const saved = Array.isArray(rows) ? rows[0] : rows;
  const record = asRecord({
    ...book,
    id: saved?.id,
    isbn: normalized.isbn13,
    isbn13: normalized.isbn13,
    isbn10: normalized.isbn10,
    author: payload.author,
  });
  cacheLocal(record);
  return record;
}
