/**
 * CSV intake mapping checks — headers, normalisation, refresh merge, payloads.
 * Run: node explore/csv-mapping.test.js
 */
import { booksToCsv } from './catalogue-csv.js';
import {
  applyLookup,
  canonicalField,
  draftToPayload,
  draftsFromCsv,
  hitToBook,
  normalizeAvailability,
  normalizeFormat,
  orderCovers,
  pickBestHit,
  splitAuthors,
  titleAuthorKey,
  yearFrom,
} from './csv-mapping.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n  got: ${a}\n  want: ${b}`);
}

/* Header aliasing */
assert(canonicalField('Title') === 'title', 'Title maps to title');
assert(canonicalField('  AUTHORS ') === 'author', 'Authors maps to author');
assert(canonicalField('ISBN-13') === 'isbn', 'ISBN-13 maps to isbn');
assert(canonicalField('Cover URL') === 'cover_url', 'Cover URL maps to cover_url');
assert(canonicalField('publication year') === 'year', 'publication year maps to year');
assert(canonicalField('Rating') === '', 'unknown column is reported as unmapped');

/* Value normalisation */
assert(yearFrom('2002-04-01') === 2002, 'year pulled from a date');
assert(yearFrom('') === null, 'missing year is null');
assert(yearFrom('nope') === null, 'unparseable year is null');
assertEqual(splitAuthors('Ursula K. Le Guin & Someone Else'), ['Ursula K. Le Guin', 'Someone Else'], 'ampersand splits authors');
assertEqual(splitAuthors('A. Author, B. Writer'), ['A. Author', 'B. Writer'], 'comma splits authors');
assert(normalizeFormat('Hardback') === 'hardcover', 'hardback normalises');
assert(normalizeFormat('Kindle Edition') === 'ebook', 'kindle normalises to ebook');
assert(normalizeFormat('') === 'paperback', 'missing format defaults to paperback');
assert(normalizeFormat('vinyl') === 'other', 'unknown format falls to other');
assert(normalizeAvailability('On Loan') === 'on_loan', 'on loan normalises');
assert(normalizeAvailability('') === 'available', 'missing availability defaults to available');

/* Parsing a third-party style CSV, quoted fields and unicode included */
const foreign = [
  'Title,Authors,ISBN-13,Publication Year,Publisher,Rating',
  '"Hello, ""World""",村上春樹,9780306406157,2002-05-01,Café Press,5',
  'مرحبا,Émile;A. Other,,1999,,3',
  ',,,,,',
  'Only A Title,,,,,',
].join('\r\n');

const parsed = draftsFromCsv(foreign);
assert(parsed.drafts.length === 3, 'three usable rows parsed');
assert(parsed.skipped === 1, 'the blank row is counted as skipped');
assertEqual(parsed.unknown, ['Rating'], 'unmapped columns are reported');
assert(parsed.drafts[0].title === 'Hello, "World"', 'quoted title with comma and quotes');
assert(parsed.drafts[0].author === '村上春樹', 'unicode author preserved');
assert(parsed.drafts[0].year === 2002, 'year parsed from date column');
assert(parsed.drafts[0].isbn === '9780306406157', 'isbn kept');
assert(parsed.drafts[1].title === 'مرحبا', 'arabic title preserved');
assertEqual(parsed.drafts[1].authors, ['Émile', 'A. Other'], 'semicolon splits authors');
assert(parsed.drafts[1].isbn === null, 'missing isbn is null');
assert(parsed.drafts[2].title === 'Only A Title', 'title-only row is kept');
assert(parsed.drafts[0].key !== parsed.drafts[1].key, 'draft keys are distinct');

/* Round-trip: our own export is readable by the intake mapper */
const exported = booksToCsv([
  {
    id: 'abc',
    title: 'Kept, Exactly',
    author: 'A. Author, B. Writer',
    format: 'hardcover',
    is_digital: false,
    genres: ['fiction', 'literary'],
    tags: ['sample'],
    keywords: 'one, two',
    description: 'Line one\nLine two',
    availability: 'on_loan',
    year: 1998,
    publisher: 'Commonplace Press',
    isbn: '9780306406157',
    cover_url: 'https://example.com/a.jpg',
  },
]);
const back = draftsFromCsv(exported);
assert(back.drafts.length === 1, 'export re-reads as one draft');
const own = back.drafts[0];
assert(own.title === 'Kept, Exactly', 'export title survives');
assert(own.csvId === 'abc', 'catalogue id is retained for duplicate checks');
assert(own.format === 'hardcover', 'format survives');
assert(own.availability === 'on_loan', 'availability survives');
assertEqual(own.genres, ['fiction', 'literary'], 'genres survive');
assertEqual(own.tags, ['sample'], 'tags survive');
assert(own.description === 'Line one\nLine two', 'multiline description survives');
assert(own.coverUrl === 'https://example.com/a.jpg', 'cover url becomes the selected cover');
assertEqual(own.covers, [{ url: 'https://example.com/a.jpg', source: 'csv' }], 'csv cover is an option');

/* Payload never carries an id and always satisfies the column checks */
const payload = draftToPayload(own);
assert(!('id' in payload), 'payload has no id so inserts create new rows');
assert(payload.title === 'Kept, Exactly', 'payload title');
assert(payload.format === 'hardcover', 'payload format is a legal value');
assert(payload.availability === 'on_loan', 'payload availability is a legal value');
assert(payload.year === 1998, 'payload year');
assert(payload.isbn === '9780306406157', 'payload keeps the canonical ISBN-13');
assert(
  draftToPayload({ isbn: '0-306-40615-2' }).isbn === '9780306406157',
  'a hyphenated ISBN-10 is stored canonically so scans match it',
);
assert(
  draftToPayload({ isbn: 'not-an-isbn' }).isbn === 'not-an-isbn',
  'an unparseable ISBN is kept as typed rather than dropped',
);
const bare = draftToPayload({ title: '', author: '', format: '', availability: '' });
assert(bare.title === 'Untitled' && bare.author === 'Unknown author', 'blank rows get safe defaults');
assert(bare.format === 'paperback' && bare.availability === 'available', 'blank enums get defaults');
assert(bare.cover_url === null && bare.year === null, 'missing values stay null');

/* Cover ordering prefers Open Library, then Google Books */
assertEqual(
  orderCovers([
    { url: 'g1', source: 'google-books' },
    { url: 'c1', source: 'csv' },
    { url: 'o1', source: 'open-library' },
    { url: 'g1', source: 'google-books' },
  ]).map((c) => c.url),
  ['o1', 'g1', 'c1'],
  'Open Library covers lead and duplicates drop',
);

/* Hit scoring prefers the closest title, then Open Library */
const draft = parsed.drafts[0];
const hits = [
  { title: 'Hello World', authors: ['Someone'], publicationYear: 1980, isbn: null, coverUrl: null, source: 'google-books' },
  { title: 'Hello, "World"', authors: ['村上春樹'], publicationYear: 2002, isbn: '9780306406157', coverUrl: 'x', source: 'open-library' },
];
assert(pickBestHit(hits, draft) === hits[1], 'the exact title/author/year match wins');
assert(pickBestHit([], draft) === null, 'no hits gives no match');

/* Refresh replaces details but keeps the old cover selectable */
const refreshed = applyLookup(own, {
  title: 'Fresh Listing',
  authors: ['Fresh Author'],
  isbn13: '9780140449136',
  publicationYear: 2001,
  publisher: 'Fresh House',
  description: 'A fresh blurb.',
  coverUrl: 'https://covers/ol.jpg',
  availableCovers: [
    { url: 'https://covers/gb.jpg', source: 'google-books' },
    { url: 'https://covers/ol.jpg', source: 'open-library' },
  ],
  source: 'both',
});
assert(refreshed.title === 'Fresh Listing', 'title replaced by the fresh listing');
assert(refreshed.author === 'Fresh Author', 'author replaced');
assert(refreshed.isbn === '9780140449136', 'isbn replaced');
assert(refreshed.year === 2001 && refreshed.publisher === 'Fresh House', 'year and publisher replaced');
assert(refreshed.description === 'A fresh blurb.', 'description replaced');
assert(refreshed.refreshed === true, 'draft is flagged as refreshed');
assert(refreshed.coverUrl === 'https://covers/ol.jpg', 'Open Library cover is selected first');
assert(refreshed.covers.some((c) => c.url === 'https://example.com/a.jpg'), 'the CSV cover stays available');
assert(refreshed.genres.length === 2, 'CSV-only fields are untouched by refresh');

const thin = applyLookup(own, { title: '', authors: [], coverUrl: null, availableCovers: [], source: 'open-library' });
assert(thin.title === 'Kept, Exactly', 'an empty fresh field keeps the CSV value');
assert(thin.coverUrl === 'https://example.com/a.jpg', 'cover falls back to the CSV cover');

/* Search hits map into the lookup shape */
const shaped = hitToBook({ title: 'T', authors: ['A'], isbn: '9780306406157', publicationYear: 2000, publisher: 'P', coverUrl: 'u', source: 'open-library' });
assert(shaped.isbn13 === '9780306406157', '13-digit isbn is set as isbn13');
assertEqual(shaped.availableCovers, [{ url: 'u', source: 'open-library' }], 'hit cover becomes an option');

/* Duplicate keys ignore case, punctuation, and extra authors */
assert(
  titleAuthorKey('The Dispossessed', 'Ursula K. Le Guin, Someone')
    === titleAuthorKey('the  dispossessed!', 'ursula k le guin'),
  'title/author key is stable across punctuation and extra authors',
);
assert(titleAuthorKey('A', 'B') !== titleAuthorKey('A', 'C'), 'different authors give different keys');

/* An empty file yields nothing rather than throwing */
assertEqual(draftsFromCsv(''), { drafts: [], skipped: 0, columns: [], unknown: [] }, 'empty text is handled');
assert(draftsFromCsv('title,author\r\n').drafts.length === 0, 'header-only CSV gives no drafts');

console.log('csv-mapping.js checks passed');
