/**
 * The editable intake draft form, shared by CSV batch rows and the search preview.
 * Markup is a pure string; edits are applied back onto the draft object.
 */
import { splitAuthors, yearFrom } from './csv-mapping.js';

export const FORMAT_OPTIONS = ['paperback', 'hardcover', 'ebook', 'other'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Provenance chips for a draft: where its details came from. */
export function sourceTagsHtml(source) {
  const labels = source === 'both'
    ? ['Open Library', 'Google Books']
    : source === 'google-books'
      ? ['Google Books']
      : source === 'open-library'
        ? ['Open Library']
        : ['From CSV'];
  return labels.map((label) => `<span class="source-tag">${escapeHtml(label)}</span>`).join('');
}

/**
 * @param {object} draft
 * @param {number | string | null} row identifier echoed onto each control
 */
export function intakeFieldsHtml(draft, row = null) {
  const rowAttr = row === null || row === undefined ? '' : ` data-row="${escapeHtml(row)}"`;
  const formats = FORMAT_OPTIONS
    .map((value) => `<option value="${value}"${value === draft.format ? ' selected' : ''}>${value}</option>`)
    .join('');
  return `
    <label class="intake-field">
      <span>Title</span>
      <input type="text"${rowAttr} data-field="title" value="${escapeHtml(draft.title)}" placeholder="Untitled" />
    </label>
    <label class="intake-field">
      <span>Author(s)</span>
      <input type="text"${rowAttr} data-field="author" value="${escapeHtml(draft.author)}" placeholder="Unknown author" />
    </label>
    <div class="intake-field-grid">
      <label class="intake-field">
        <span>Year</span>
        <input type="text" inputmode="numeric"${rowAttr} data-field="year" value="${escapeHtml(draft.year ?? '')}" placeholder="—" />
      </label>
      <label class="intake-field">
        <span>Publisher</span>
        <input type="text"${rowAttr} data-field="publisher" value="${escapeHtml(draft.publisher ?? '')}" placeholder="—" />
      </label>
      <label class="intake-field">
        <span>ISBN</span>
        <input type="text"${rowAttr} data-field="isbn" value="${escapeHtml(draft.isbn ?? '')}" placeholder="—" />
      </label>
      <label class="intake-field">
        <span>Format</span>
        <select${rowAttr} data-field="format">${formats}</select>
      </label>
    </div>
    <label class="intake-field">
      <span>Description</span>
      <textarea rows="3"${rowAttr} data-field="description" placeholder="—">${escapeHtml(draft.description ?? '')}</textarea>
    </label>
  `;
}

/**
 * Write one edited control back onto the draft.
 * @returns {object} the same draft, mutated
 */
export function applyFieldEdit(draft, field, value) {
  if (!draft || !field) return draft;
  if (field === 'year') {
    draft.year = yearFrom(value);
  } else if (field === 'author') {
    draft.author = value;
    draft.authors = splitAuthors(value);
  } else if (field === 'format') {
    draft.format = value;
    draft.isDigital = value === 'ebook';
  } else {
    draft[field] = value;
  }
  return draft;
}
