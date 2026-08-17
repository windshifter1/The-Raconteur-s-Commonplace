/**
 * Local + catalogue collection for intake duplicates and ACCEPT.
 * Catalogue rows live under the Yusuf account; recently accepted scans also cache locally.
 */
import config from './config.js';
import {
  booksUrl,
  loadAccount,
  loadAccountBooksWhere,
  restHeaders,
} from '../lib/account-catalogue.js';
import { isbnKeys, matchesIsbn, normalizeIsbn } from './isbn.js';

const STORAGE_KEY = 'trc-intake-collection';

function writeHeaders() {
  return restHeaders(config, {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });
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

/** Drop the local intake cache entry so a deleted title can be scanned in again. */
export function forgetLocalByIsbn(isbn) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return;
  const rows = readLocal().filter((row) => !(
    matchesIsbn(row.isbn, normalized)
    || matchesIsbn(row.isbn13, normalized)
    || matchesIsbn(row.isbn10, normalized)
  ));
  writeLocal(rows);
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

const BOOK_COLS = 'id,title,author,isbn,cover_url,year,publisher,description';

async function findRemoteByIsbn(normalized) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const keys = isbnKeys(normalized);
  const orParts = keys.map((k) => `isbn.eq.${encodeURIComponent(k)}`);
  try {
    const exact = await loadAccountBooksWhere(
      config,
      `or=(${orParts.join(',')})`,
      BOOK_COLS,
    );
    for (const row of exact.books) {
      if (matchesIsbn(row.isbn, normalized)) return asRecord(row);
    }
  } catch (err) {
    const status = Number(String(err?.message || '').match(/\((\d+)\)/)?.[1]);
    if (status >= 500) throw err;
  }

  const scan = await loadAccountBooksWhere(config, 'isbn=not.is.null&limit=2000', BOOK_COLS);
  for (const row of scan.books) {
    if (matchesIsbn(row.isbn, normalized)) return asRecord(row);
  }
  return null;
}

/**
 * Local cache first, then Yusuf's account books. Same ISBN-10/13 pair counts as one edition.
 */
export async function findInCollection(normalized) {
  const local = findLocalByIsbn(normalized);
  if (local) return local;
  return findRemoteByIsbn(normalized);
}

/**
 * Insert already-built book rows under the active account, in chunks so one
 * oversized CSV cannot blow the request limit. Order is preserved.
 * @param {object[]} rows book payloads (no id)
 * @param {{ onProgress?: (done: number, total: number) => void, chunkSize?: number }} [opts]
 * @returns {Promise<{ inserted: object[], failed: { row: object, message: string }[] }>}
 */
export async function insertBooks(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const inserted = [];
  const failed = [];
  if (!list.length) return { inserted, failed };

  const url = booksUrl(config);
  if (!url) throw new Error('Catalogue is not configured.');
  const account = await loadAccount(config);
  const chunkSize = Math.max(1, Math.min(100, Number(opts.chunkSize) || 40));

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((row) => (
      account.id ? { ...row, account_id: account.id } : { ...row }
    ));
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(chunk),
      });
    } catch {
      for (const row of chunk) failed.push({ row, message: 'Network unavailable.' });
      opts.onProgress?.(Math.min(i + chunk.length, list.length), list.length);
      continue;
    }
    const body = await res.json().catch(() => []);
    if (!res.ok) {
      const message = body?.message || body?.error || `Could not add these books (${res.status}).`;
      for (const row of chunk) failed.push({ row, message });
    } else {
      const saved = Array.isArray(body) ? body : [body];
      saved.forEach((row, n) => {
        inserted.push(row);
        const normalized = normalizeIsbn(row?.isbn || chunk[n]?.isbn);
        if (!normalized) return;
        cacheLocal(asRecord({
          ...row,
          isbn: normalized.isbn13,
          isbn13: normalized.isbn13,
          isbn10: normalized.isbn10,
        }));
      });
    }
    opts.onProgress?.(Math.min(i + chunk.length, list.length), list.length);
  }
  return { inserted, failed };
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

  const account = await loadAccount(config);
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
  if (account.id) payload.account_id = account.id;

  const url = booksUrl(config);
  if (!url) throw new Error('Catalogue is not configured.');
  const res = await fetch(url, {
    method: 'POST',
    headers: writeHeaders(),
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
