/**
 * Search result preference — ISBN first, then cover.
 * Run: node explore/book-search.test.js
 */
import { catalogRank, mergeHits, preferCatalogHits } from './book-search.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n  got: ${a}\n  want: ${b}`);
}

assert(catalogRank({ isbn: '1', coverUrl: 'c' }) === 3, 'isbn + cover ranks highest');
assert(catalogRank({ isbn: '1', coverUrl: null }) === 2, 'isbn alone beats cover alone');
assert(catalogRank({ isbn: null, coverUrl: 'c' }) === 1, 'cover alone beats neither');
assert(catalogRank({ isbn: null, coverUrl: null }) === 0, 'bare listings rank last');

const ordered = preferCatalogHits([
  { title: 'A', authors: [], isbn: null, coverUrl: 'c', source: 'open-library' },
  { title: 'B', authors: [], isbn: '9780306406157', coverUrl: null, source: 'google-books' },
  { title: 'C', authors: [], isbn: '9780140449136', coverUrl: 'x', source: 'open-library' },
  { title: 'D', authors: [], isbn: null, coverUrl: null, source: 'google-books' },
]);
assertEqual(
  ordered.map((hit) => hit.title),
  ['C', 'B', 'A', 'D'],
  'preferCatalogHits orders isbn+cover, isbn, cover, then bare',
);

/* When two records fingerprint as the same edition, prefer the fuller one. */
const merged = mergeHits([
  { title: 'Dune', authors: ['Frank Herbert'], publicationYear: 1965, isbn: '9780441172719', coverUrl: null, source: 'open-library', sourceId: 'o', openLibraryId: 'o', googleBooksId: null, publisher: null },
  { title: 'Dune', authors: ['Frank Herbert'], publicationYear: 1965, isbn: '9780441172719', coverUrl: 'pretty', source: 'google-books', sourceId: 'g', openLibraryId: null, googleBooksId: 'g', publisher: 'Chilton' },
]);
assert(merged.length === 1, 'same ISBN merges to one hit');
assert(merged[0].isbn === '9780441172719', 'merge keeps the ISBN');
assert(merged[0].coverUrl === 'pretty', 'among ISBN matches, the cover wins');
assert(merged[0].source === 'both', 'both sources are remembered');

/* Without an ISBN, a jacket still outranks a bare title match. */
const byTitle = mergeHits([
  { title: 'Dune', authors: ['Frank Herbert'], publicationYear: 1965, isbn: null, coverUrl: null, source: 'open-library', sourceId: 'o1', openLibraryId: 'o1', googleBooksId: null, publisher: null },
  { title: 'Dune', authors: ['Frank Herbert'], publicationYear: 1965, isbn: null, coverUrl: 'jacket', source: 'google-books', sourceId: 'g1', openLibraryId: null, googleBooksId: 'g1', publisher: null },
]);
assert(byTitle[0].coverUrl === 'jacket', 'cover preferred when neither has an ISBN');

console.log('book-search.js checks passed');
