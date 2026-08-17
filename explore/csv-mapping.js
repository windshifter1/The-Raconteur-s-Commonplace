/**
 * CSV intake mapping — pure helpers shared by the Add Books CSV panel and its tests.
 * Reads our own export columns first, and tolerates common third-party header names.
 */
import { parseCsv } from './catalogue-csv.js';
import { normalizeIsbn } from './isbn.js';

/** Canonical field ← accepted header spellings (compared with punctuation stripped). */
const HEADER_ALIASES = {
  id: ['id', 'bookid', 'uuid'],
  title: ['title', 'booktitle', 'name'],
  author: ['author', 'authors', 'creator', 'by', 'primaryauthor'],
  isbn: ['isbn', 'isbn13', 'isbn10', 'ean', 'barcode'],
  year: ['year', 'publicationyear', 'published', 'publishdate', 'publicationdate', 'datepublished', 'firstpublished', 'copyright'],
  publisher: ['publisher', 'imprint', 'publication'],
  description: ['description', 'summary', 'synopsis', 'overview', 'blurb'],
  cover_url: ['coverurl', 'cover', 'coverimage', 'image', 'imageurl', 'jacket', 'thumbnail'],
  format: ['format', 'binding', 'mediatype', 'media'],
  genres: ['genres', 'genre', 'subjects', 'subject', 'categories', 'category'],
  tags: ['tags', 'tag', 'collections'],
  keywords: ['keywords', 'keyword'],
  availability: ['availability', 'status'],
  is_digital: ['isdigital', 'digital', 'ebook'],
  shelf_id: ['shelfid'],
};

const FORMATS = ['paperback', 'hardcover', 'ebook', 'other'];
const AVAILABILITY = ['available', 'on_loan', 'reserved', 'unavailable'];

export function normalizeHeaderName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** @returns {string} canonical field name, or '' when the column is not understood */
export function canonicalField(name) {
  const key = normalizeHeaderName(name);
  if (!key) return '';
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === key || aliases.includes(key)) return field;
  }
  return '';
}

export function yearFrom(value) {
  const match = String(value ?? '').match(/\d{4}/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1000 && n <= 2100 ? n : null;
}

/** Author columns hold a joined string; split so each person is separate. */
export function splitAuthors(value) {
  return String(value ?? '')
    .split(/\s*[,;/|]\s*|\s+&\s+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeFormat(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'paperback';
  if (FORMATS.includes(raw)) return raw;
  if (/hard|cloth|board/.test(raw)) return 'hardcover';
  if (/paper|soft|mass|trade|pocket/.test(raw)) return 'paperback';
  if (/ebook|e-book|kindle|epub|pdf|digital|audio/.test(raw)) return 'ebook';
  return 'other';
}

export function normalizeAvailability(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'available';
  if (AVAILABILITY.includes(raw)) return raw;
  if (/loan|lent|borrow|out/.test(raw)) return 'on_loan';
  if (/reserve|hold/.test(raw)) return 'reserved';
  if (/unavailable|missing|lost|damaged/.test(raw)) return 'unavailable';
  return 'available';
}

function boolFrom(value, fallback = false) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return fallback;
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? '')
    .split(/\s*[,;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function textOf(value) {
  return String(value ?? '').trim();
}

/**
 * Turn one mapped CSV row into an editable intake draft.
 * @param {Record<string, string>} row
 * @param {number} index
 */
export function draftFromRow(row, index = 0) {
  const author = textOf(row.author);
  const covers = [];
  const csvCover = textOf(row.cover_url);
  if (csvCover) covers.push({ url: csvCover, source: 'csv' });
  const format = normalizeFormat(row.format);
  return {
    key: `csv-${index}`,
    csvId: textOf(row.id) || null,
    title: textOf(row.title),
    author,
    authors: splitAuthors(author),
    isbn: textOf(row.isbn) || null,
    year: yearFrom(row.year),
    publisher: textOf(row.publisher) || null,
    description: textOf(row.description) || null,
    coverUrl: csvCover || null,
    covers,
    format,
    isDigital: boolFrom(row.is_digital, format === 'ebook'),
    genres: splitList(row.genres),
    tags: splitList(row.tags),
    keywords: textOf(row.keywords) || null,
    availability: normalizeAvailability(row.availability),
    source: 'csv',
    refreshed: false,
    note: '',
  };
}

/**
 * Parse CSV text into drafts, keeping file order.
 * @param {string} text
 * @returns {{ drafts: object[], skipped: number, columns: string[], unknown: string[] }}
 */
export function draftsFromCsv(text) {
  const records = parseCsv(text);
  if (!records.length) return { drafts: [], skipped: 0, columns: [], unknown: [] };

  const header = records[0];
  const fields = header.map(canonicalField);
  const columns = [...new Set(fields.filter(Boolean))];
  const unknown = header.filter((name, i) => textOf(name) && !fields[i]).map(textOf);

  const drafts = [];
  let skipped = 0;
  for (let r = 1; r < records.length; r += 1) {
    const cells = records[r];
    if (cells.every((cell) => textOf(cell) === '')) {
      // A lone empty cell is a stray blank line; a full row of commas is a real empty row.
      if (cells.length > 1) skipped += 1;
      continue;
    }
    const row = {};
    for (let c = 0; c < fields.length; c += 1) {
      const field = fields[c];
      if (!field) continue;
      // First column wins when a file repeats a header (e.g. isbn13 then isbn10).
      if (row[field] === undefined || row[field] === '') row[field] = textOf(cells[c] ?? '');
    }
    const draft = draftFromRow(row, drafts.length);
    // A row with no title and no ISBN carries nothing we can add or look up.
    if (!draft.title && !draft.isbn) {
      skipped += 1;
      continue;
    }
    drafts.push(draft);
  }
  return { drafts, skipped, columns, unknown };
}

/** Open Library first, Google Books second — matches the refresh preference. */
export function orderCovers(list) {
  const rank = (source) => (source === 'open-library' ? 0 : source === 'google-books' ? 1 : 2);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const url = textOf(item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: item.source || 'other' });
  }
  return out.sort((a, b) => rank(a.source) - rank(b.source));
}

/**
 * Replace a draft's details with a fresh listing, keeping CSV values only where
 * the fresh record has nothing. The old cover stays selectable.
 * @param {object} draft
 * @param {object} book lookup/search record
 */
export function applyLookup(draft, book) {
  const authors = Array.isArray(book.authors) && book.authors.length
    ? book.authors.map((n) => textOf(n)).filter(Boolean)
    : draft.authors;
  // availableCovers carry per-cover provenance; the merged coverUrl only knows the
  // record's overall source, so it goes last and loses to a more specific entry.
  const fresh = orderCovers([
    ...(Array.isArray(book.availableCovers) ? book.availableCovers : []),
    ...(book.coverUrl ? [{ url: book.coverUrl, source: book.source || 'other' }] : []),
  ]);
  const covers = [...fresh];
  for (const item of draft.covers) {
    if (!covers.some((c) => c.url === item.url)) covers.push(item);
  }
  return {
    ...draft,
    title: textOf(book.title) || draft.title,
    author: authors.join(', ') || draft.author,
    authors,
    isbn: textOf(book.isbn13 || book.isbn) || draft.isbn,
    year: book.publicationYear ?? draft.year,
    publisher: textOf(book.publisher) || draft.publisher,
    description: textOf(book.description) || draft.description,
    coverUrl: covers[0]?.url || draft.coverUrl,
    covers,
    source: book.source || 'open-library',
    refreshed: true,
    note: '',
  };
}

/**
 * Score a search hit against the CSV row so the closest edition wins.
 * Open Library outranks Google Books on equal footing.
 */
export function scoreHit(hit, draft) {
  const norm = (value) => textOf(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const title = norm(draft.title);
  const hitTitle = norm(hit.title);
  if (!hitTitle) return -1;
  let score = 0;
  if (title && hitTitle === title) score += 10;
  else if (title && (hitTitle.startsWith(title) || title.startsWith(hitTitle))) score += 6;
  else if (title && (hitTitle.includes(title) || title.includes(hitTitle))) score += 3;

  const wantAuthor = norm(draft.authors[0] || draft.author);
  const hitAuthors = (hit.authors || []).map(norm);
  if (wantAuthor && hitAuthors.some((a) => a === wantAuthor)) score += 5;
  else if (wantAuthor && hitAuthors.some((a) => a.includes(wantAuthor) || wantAuthor.includes(a))) score += 3;

  if (draft.year && hit.publicationYear === draft.year) score += 2;
  if (hit.isbn) score += 1;
  if (hit.coverUrl) score += 1;
  if (hit.source === 'open-library') score += 2;
  else if (hit.source === 'both') score += 1;
  return score;
}

/** How far apart two scores may be and still count as a tie. */
export const AMBIGUITY_GAP = 2;

function normText(value) {
  return textOf(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Plausible matches, best first. Sorting is stable, so equal scores keep search order. */
export function rankHits(hits, draft) {
  return (hits || [])
    .map((hit) => ({ hit, score: scoreHit(hit, draft) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function pickBestHit(hits, draft) {
  return rankHits(hits, draft)[0]?.hit || null;
}

/**
 * The same book, whatever printing: title and lead author decide. Reissues of one
 * title are not a question worth asking the reader.
 */
export function sameWork(a, b) {
  if (normText(a?.title) !== normText(b?.title)) return false;
  return normText((a?.authors || [])[0]) === normText((b?.authors || [])[0]);
}

/** Distinct books worth choosing between, best first. */
export function workCandidates(ranked, limit = 5) {
  const out = [];
  for (const entry of ranked) {
    if (out.some((kept) => sameWork(kept.hit, entry.hit))) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A row needs a human choice when two different books match it almost equally — a
 * thin title with no author, say. An exact title beside an inexact one is no contest.
 */
export function needsChoice(candidates, draft) {
  if (candidates.length < 2) return false;
  const [top, next] = candidates;
  if (top.score - next.score > AMBIGUITY_GAP) return false;
  const wanted = normText(draft?.title);
  if (wanted && normText(top.hit.title) === wanted && normText(next.hit.title) !== wanted) return false;
  return true;
}

/**
 * Read the search results for one CSV row: the listing to apply, the shortlist to
 * offer, and whether the row should be flagged for the reader to settle.
 * @returns {{ best: object | null, candidates: object[], ambiguous: boolean }}
 */
export function matchChoices(hits, draft, limit = 5) {
  const candidates = workCandidates(rankHits(hits, draft), limit);
  return {
    best: candidates[0]?.hit || null,
    candidates: candidates.map((entry) => entry.hit),
    ambiguous: needsChoice(candidates, draft),
  };
}

/** Search hits carry fewer fields than an ISBN lookup; shape them the same way. */
export function hitToBook(hit) {
  return {
    title: hit.title,
    authors: Array.isArray(hit.authors) ? hit.authors : [],
    isbn: hit.isbn || null,
    isbn13: hit.isbn && String(hit.isbn).length === 13 ? hit.isbn : null,
    publicationYear: hit.publicationYear ?? null,
    publisher: hit.publisher || null,
    description: null,
    coverUrl: hit.coverUrl || null,
    availableCovers: hit.coverUrl ? [{ url: hit.coverUrl, source: hit.source || 'other' }] : [],
    source: hit.source || 'open-library',
  };
}

/**
 * Book row for insert. Ids are never carried over — these are new rows — and a
 * valid ISBN is stored canonically so scans match it later. Anything unparseable
 * is kept as typed rather than thrown away.
 */
export function draftToPayload(draft) {
  const isbn = normalizeIsbn(draft.isbn)?.isbn13 || textOf(draft.isbn) || null;
  return {
    title: textOf(draft.title) || 'Untitled',
    author: textOf(draft.author) || 'Unknown author',
    format: normalizeFormat(draft.format),
    is_digital: Boolean(draft.isDigital),
    genres: Array.isArray(draft.genres) ? draft.genres : [],
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    keywords: textOf(draft.keywords) || 'csv intake',
    description: textOf(draft.description) || null,
    availability: normalizeAvailability(draft.availability),
    year: draft.year ?? null,
    publisher: textOf(draft.publisher) || null,
    isbn,
    cover_url: textOf(draft.coverUrl) || null,
  };
}

/** Loose identity for duplicate checks when there is no ISBN to compare. */
export function titleAuthorKey(title, author) {
  const norm = (value) => textOf(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const first = splitAuthors(author)[0] || author;
  return `${norm(title)}|${norm(first)}`;
}
