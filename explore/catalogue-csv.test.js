/**
 * Catalogue CSV checks — escape, unicode, empties, order, and import round-trip.
 * Run: node explore/catalogue-csv.test.js
 */
import {
  CSV_COLUMNS,
  booksFromCsv,
  booksToCsv,
  escapeCsvField,
  parseCsv,
} from './catalogue-csv.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n  got: ${a}\n  want: ${b}`);
}

assert(escapeCsvField('plain') === 'plain', 'plain field stays unquoted');
assert(escapeCsvField('a,b') === '"a,b"', 'comma is quoted');
assert(escapeCsvField('say "hi"') === '"say ""hi"""', 'quotes are doubled');
assert(escapeCsvField('line\nbreak') === '"line\nbreak"', 'newline is quoted');
assert(escapeCsvField('a\r\nb') === '"a\r\nb"', 'CRLF is quoted');
assert(escapeCsvField(null) === '', 'null becomes empty');
assert(escapeCsvField(undefined) === '', 'undefined becomes empty');

const emptyCsv = booksToCsv([]);
assert(emptyCsv.startsWith(`${CSV_COLUMNS.join(',')}\r\n`), 'empty library still writes header');
assert(booksFromCsv(emptyCsv).length === 0, 'empty CSV imports zero books');

const sample = [
  {
    id: '1',
    title: 'Hello, "World"',
    author: '村上春樹',
    format: 'paperback',
    is_digital: false,
    shelf_id: null,
    genres: ['fiction', 'literary'],
    keywords: 'tokyo, cats',
    description: 'Line one\nLine two',
    availability: 'available',
    year: 2002,
    publisher: 'Café Press',
    isbn: '9780307476463',
    cover_url: 'https://example.com/cover.jpg',
    digital_url: null,
    digital_mime: null,
    tags: ['sample'],
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
  {
    id: '2',
    title: 'مرحبا',
    author: 'Émile',
    format: 'hardcover',
    is_digital: true,
    shelf_id: 'shelf-a',
    genres: [],
    keywords: null,
    description: null,
    availability: 'on_loan',
    year: null,
    publisher: '',
    isbn: null,
    cover_url: null,
    digital_url: null,
    digital_mime: null,
    tags: [],
    created_at: null,
    updated_at: null,
  },
];

const csv = booksToCsv(sample);
assert(csv.includes('村上春樹'), 'unicode author is preserved');
assert(csv.includes('مرحبا'), 'unicode title is preserved');
assert(csv.includes('Émile') || csv.includes('Ã'), 'latin accent present in UTF-8 text');
assert(csv.includes('"Hello, ""World"""'), 'title commas and quotes escaped');
assert(csv.includes('"Line one\nLine two"') || csv.includes('"Line one\r\nLine two"'), 'description newline escaped');

const parsed = parseCsv(csv);
assertEqual(parsed[0], CSV_COLUMNS, 'header row uses importer field names');
assert(parsed.length === 3, 'header + two books');

const books = booksFromCsv(csv);
assert(books.length === 2, 'all books included');
assert(books[0].title === 'Hello, "World"', 'round-trip title');
assert(books[0].author === '村上春樹', 'round-trip unicode author');
assert(books[1].title === 'مرحبا', 'round-trip arabic title');
assert(books[1].author === 'Émile', 'round-trip accented author');
assertEqual(books[0].genres, ['fiction', 'literary'], 'round-trip genres array');
assert(books[0].is_digital === false, 'round-trip boolean false');
assert(books[1].is_digital === true, 'round-trip boolean true');
assert(books[0].year === 2002, 'round-trip year');
assertEqual(books[1].genres, [], 'empty genres round-trip to []');
assertEqual(books[1].tags, [], 'empty tags round-trip to []');
assert(books[1].year === null, 'missing year stays empty/null');
assert(books[1].isbn === null, 'missing isbn stays empty/null');
assert(books[0].description === 'Line one\nLine two', 'round-trip multiline description');
assert(books[0].id === '1' && books[1].id === '2', 'book order preserved');

const again = booksFromCsv(booksToCsv(books));
assertEqual(again, books, 'exported CSV can be imported again without losing book data');

console.log('catalogue-csv.js checks passed');
