import {
  isbn10To13,
  isbn13To10,
  isValidIsbn10,
  isValidIsbn13,
  matchesIsbn,
  normalizeIsbn,
} from './isbn.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const n10 = normalizeIsbn('0-306-40615-2');
assert(n10 && n10.isbn13 === '9780306406157', 'ISBN-10 hyphenated should become ISBN-13');
assert(n10.isbn10 === '0306406152', 'ISBN-10 digits preserved');
assert(isValidIsbn13(n10.isbn13), 'Derived ISBN-13 must checksum');

const n13 = normalizeIsbn('978-0-306-40615-7');
assert(n13 && n13.canonical === n10.canonical, 'ISBN-10/13 pair is one edition');
assert(isbn13To10(n13.isbn13) === n10.isbn10, 'ISBN-13 converts back to ISBN-10');
assert(isbn10To13(n10.isbn10) === n13.isbn13, 'ISBN-10 converts to ISBN-13');

assert(!normalizeIsbn('1234567890'), 'Bad ISBN-10 checksum is rejected');
assert(!normalizeIsbn('9780743273566'), 'Bad ISBN-13 checksum is rejected');
assert(!normalizeIsbn('5449000000996'), 'Non-book EAN-13 is not treated as ISBN');
assert(!normalizeIsbn('abc'), 'Garbage is rejected');

assert(matchesIsbn('9780306406157', n10), 'Canonical ISBN-13 matches the pair');
assert(matchesIsbn('0306406152', n13), 'Stored ISBN-10 matches ISBN-13 scan');
assert(matchesIsbn('978-0-306-40615-7', n10), 'Hyphenated stored ISBN still matches');
assert(!matchesIsbn('9780141439518', n13), 'A different edition ISBN does not match');

assert(isValidIsbn10('020161622X') || isValidIsbn10('020161622x'), 'ISBN-10 X check digit');
const x = normalizeIsbn('020161622X');
assert(x && x.isbn13.startsWith('978'), 'ISBN-10 X converts into 978 ISBN-13');

console.log('isbn.js checks passed');
