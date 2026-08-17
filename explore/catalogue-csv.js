/**
 * Catalogue CSV — same column names the library rows / importer use.
 * Serialize and parse are inverses so an export can be imported without data loss.
 */

/** Header order matches public.books columns used by the app. */
export const CSV_COLUMNS = [
  'id',
  'title',
  'author',
  'format',
  'is_digital',
  'shelf_id',
  'genres',
  'keywords',
  'description',
  'availability',
  'year',
  'publisher',
  'isbn',
  'cover_url',
  'digital_url',
  'digital_mime',
  'tags',
  'created_at',
  'updated_at',
];

const ARRAY_FIELDS = new Set(['genres', 'tags']);
const BOOL_FIELDS = new Set(['is_digital']);
const NUMBER_FIELDS = new Set(['year']);

/** RFC 4180 field: quote when the value holds comma, quote, or line break. */
export function escapeCsvField(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function cellFromBook(book, column) {
  const value = book?.[column];
  if (value === null || value === undefined) return '';
  if (ARRAY_FIELDS.has(column)) {
    const list = Array.isArray(value)
      ? value
      : String(value)
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
    return list.join(',');
  }
  if (BOOL_FIELDS.has(column)) {
    if (value === true || value === 'true' || value === 1 || value === '1') return 'true';
    if (value === false || value === 'false' || value === 0 || value === '0') return 'false';
    return '';
  }
  return String(value);
}

/**
 * @param {object[]} books
 * @returns {string} CSV text with header row (UTF-8, no BOM)
 */
export function booksToCsv(books) {
  const rows = Array.isArray(books) ? books : [];
  const lines = [CSV_COLUMNS.map(escapeCsvField).join(',')];
  for (const book of rows) {
    lines.push(CSV_COLUMNS.map((column) => escapeCsvField(cellFromBook(book, column))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Parse one CSV line into fields (handles quoted commas / quotes / newlines via the scanner).
 * @param {string} text
 * @param {number} start
 * @returns {{ fields: string[], next: number }}
 */
function readRecord(text, start) {
  const fields = [];
  let i = start;
  let field = '';
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      fields.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      if (text[i] === '\n') i += 1;
      fields.push(field);
      return { fields, next: i };
    }
    if (ch === '\n') {
      fields.push(field);
      return { fields, next: i + 1 };
    }
    field += ch;
    i += 1;
  }

  fields.push(field);
  return { fields, next: text.length };
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  if (!source) return [];
  const records = [];
  let i = 0;
  while (i < source.length) {
    const { fields, next } = readRecord(source, i);
    // Skip a trailing blank line after the final record terminator.
    if (next >= source.length && fields.length === 1 && fields[0] === '' && records.length) {
      break;
    }
    records.push(fields);
    i = next;
  }
  return records;
}

function valueForColumn(column, raw) {
  if (raw === '' || raw === null || raw === undefined) {
    if (ARRAY_FIELDS.has(column)) return [];
    return null;
  }
  if (ARRAY_FIELDS.has(column)) {
    return String(raw)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (BOOL_FIELDS.has(column)) {
    const lower = String(raw).trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    return null;
  }
  if (NUMBER_FIELDS.has(column)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return String(raw);
}

/**
 * Turn CSV text into book row objects using the header names (importer shape).
 * @param {string} text
 * @returns {object[]}
 */
export function booksFromCsv(text) {
  const records = parseCsv(text);
  if (!records.length) return [];
  const header = records[0].map((name) => String(name || '').trim());
  const rows = [];
  for (let r = 1; r < records.length; r += 1) {
    const fields = records[r];
    // Skip completely empty trailing rows.
    if (fields.every((cell) => cell === '')) continue;
    const book = {};
    for (let c = 0; c < header.length; c += 1) {
      const column = header[c];
      if (!column) continue;
      book[column] = valueForColumn(column, fields[c] ?? '');
    }
    rows.push(book);
  }
  return rows;
}

/**
 * Trigger a UTF-8 .csv download in the browser.
 * @param {string} csvText
 * @param {string} [filename]
 */
export function downloadCsv(csvText, filename = 'catalogue.csv') {
  // BOM so Excel still opens Unicode titles correctly.
  const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
