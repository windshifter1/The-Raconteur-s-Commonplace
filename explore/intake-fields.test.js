/**
 * Shared intake form checks — markup wiring, escaping, and edits applied to drafts.
 * Run: node explore/intake-fields.test.js
 */
import { applyFieldEdit, intakeFieldsHtml, sourceTagsHtml } from './intake-fields.js';
import { coverCarouselHtml, coverHeroHtml, coverPickerHtml, withUploadedCover } from './cover-picker.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n  got: ${a}\n  want: ${b}`);
}

function draft(extra = {}) {
  return {
    title: 'Kafka on the Shore',
    author: '村上春樹',
    authors: ['村上春樹'],
    isbn: '9780099458326',
    year: 2005,
    publisher: 'Vintage',
    description: null,
    coverUrl: 'https://covers/a.jpg',
    covers: [
      { url: 'https://covers/a.jpg', source: 'open-library' },
      { url: 'https://covers/b.jpg', source: 'google-books' },
    ],
    format: 'paperback',
    isDigital: false,
    ...extra,
  };
}

/* ── Fields markup ── */

const rowed = intakeFieldsHtml(draft(), 3);
assert(rowed.includes('data-row="3" data-field="title"'), 'row id rides along each control');
assert(rowed.includes('<option value="paperback" selected>'), 'current format is selected');
assert(rowed.includes('value="村上春樹"'), 'unicode authors survive');

const rowless = intakeFieldsHtml(draft());
assert(!rowless.includes('data-row'), 'a single-draft surface omits the row id');
assert(rowless.includes('data-field="description"'), 'every field is present without a row id');

const nasty = intakeFieldsHtml(draft({ title: 'Quote " & <b>tag</b>', publisher: null, year: null }));
assert(nasty.includes('value="Quote &quot; &amp; &lt;b&gt;tag&lt;/b&gt;"'), 'field values are escaped');
assert(nasty.includes('data-field="year" value=""'), 'missing values render empty, not "null"');
assert(nasty.includes('data-field="publisher" value=""'), 'missing publisher renders empty');

/* ── Edits ── */

const edited = applyFieldEdit(draft(), 'author', 'Ursula K. Le Guin and Kazuo Ishiguro');
assertEqual(edited.authors, ['Ursula K. Le Guin', 'Kazuo Ishiguro'], 'author text splits into names');

assertEqual(applyFieldEdit(draft(), 'year', 'first published 1962').year, 1962, 'a year is dug out of prose');
assertEqual(applyFieldEdit(draft(), 'year', 'unknown').year, null, 'an unusable year clears');

const digital = applyFieldEdit(draft(), 'format', 'ebook');
assert(digital.format === 'ebook' && digital.isDigital === true, 'ebook marks the draft digital');
assert(applyFieldEdit(draft({ isDigital: true }), 'format', 'hardcover').isDigital === false, 'print clears digital');

assert(applyFieldEdit(draft(), 'publisher', 'Knopf').publisher === 'Knopf', 'plain fields are copied through');
assert(applyFieldEdit(null, 'title', 'x') === null, 'a missing draft is left alone');

/* ── Source tags ── */

assert(sourceTagsHtml('both').includes('Open Library') && sourceTagsHtml('both').includes('Google Books'), 'both sources are named');
assertEqual(sourceTagsHtml('google-books').match(/source-tag/g)?.length, 1, 'one source, one chip');
assert(sourceTagsHtml('csv').includes('From CSV'), 'CSV rows say so');

/* ── Cover picker ── */

assert(coverHeroHtml(null).includes('intake-cover--empty'), 'no cover falls back to the empty slot');
assert(coverHeroHtml('https://covers/a.jpg?a=1&b=2').includes('a=1&amp;b=2'), 'cover urls are escaped');

assert(coverCarouselHtml([{ url: 'x' }], 'x') === '', 'a lone cover needs no carousel');
const carousel = coverCarouselHtml(draft().covers, 'https://covers/b.jpg', 2);
assert(carousel.includes('data-row="2"'), 'carousel options carry the row id');
assertEqual(carousel.match(/aria-pressed="true"/g)?.length, 1, 'exactly one cover reads as chosen');
assert(carousel.indexOf('covers/a.jpg') < carousel.indexOf('covers/b.jpg'), 'covers keep the order given');

const picker = coverPickerHtml({ covers: draft().covers, selected: 'https://covers/a.jpg' });
assert(picker.includes('data-cover-pick=""'), 'upload button is delegable without a row');
assert(coverPickerHtml({ covers: [], selected: null, row: 0 }).includes('data-cover-pick="0"'), 'row id reaches the upload button');

const uploaded = withUploadedCover(draft(), 'https://covers/mine.jpg');
assert(uploaded.coverUrl === 'https://covers/mine.jpg', 'an upload becomes the selection');
assertEqual(uploaded.covers[0], { url: 'https://covers/mine.jpg', source: 'upload' }, 'the upload leads the carousel');
assertEqual(uploaded.covers.length, 3, 'the found covers stay available');
assertEqual(withUploadedCover(draft(), 'https://covers/a.jpg').covers.length, 2, 're-uploading the same url does not duplicate it');

console.log('intake-fields: all checks passed');
