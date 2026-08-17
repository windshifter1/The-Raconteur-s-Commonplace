/**
 * Cover chooser markup shared by the intake surfaces (CSV batch rows and the
 * search preview): a hero image, a carousel of candidates, and an upload button.
 * Pure string builders so the callers keep their own event delegation.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function coverHeroHtml(url) {
  if (url) {
    return `<img class="intake-cover scanner-cover" src="${escapeHtml(url)}" alt="" width="120" height="180" />`;
  }
  return '<span class="intake-cover scanner-cover intake-cover--empty" aria-hidden="true"></span>';
}

/**
 * @param {{ url: string, source?: string }[]} covers
 * @param {string | null} selected
 * @param {number | string | null} row identifier echoed onto each option
 */
export function coverCarouselHtml(covers, selected, row = null) {
  const list = Array.isArray(covers) ? covers : [];
  if (list.length < 2) return '';
  const rowAttr = row === null || row === undefined ? '' : ` data-row="${escapeHtml(row)}"`;
  return `<div class="cover-carousel" role="listbox" aria-label="Available covers">${list
    .map((item) => `<button type="button" class="cover-carousel-item" role="option"${rowAttr} data-cover-url="${escapeHtml(item.url)}" aria-pressed="${item.url === selected}" title="${escapeHtml(item.source || 'cover')}">
        <img class="scanner-cover-thumb" src="${escapeHtml(item.url)}" alt="" width="56" height="84" />
      </button>`)
    .join('')}</div>`;
}

/**
 * @param {{ covers: object[], selected: string | null, row?: number | string | null, uploadLabel?: string }} opts
 */
export function coverPickerHtml({ covers, selected, row = null, uploadLabel = 'Upload cover' }) {
  const pickAttr = row === null || row === undefined ? '' : escapeHtml(row);
  return `
    <div class="intake-hero">${coverHeroHtml(selected)}</div>
    ${coverCarouselHtml(covers, selected, row)}
    <button type="button" class="catalogue-action intake-cover-btn" data-cover-pick="${pickAttr}">${escapeHtml(uploadLabel)}</button>
  `;
}

/** An uploaded jacket joins the carousel at the front and becomes the selection. */
export function withUploadedCover(draft, url) {
  const covers = [
    { url, source: 'upload' },
    ...(Array.isArray(draft.covers) ? draft.covers.filter((item) => item.url !== url) : []),
  ];
  return { ...draft, covers, coverUrl: url };
}
