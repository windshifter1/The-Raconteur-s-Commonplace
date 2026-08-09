/**
 * The Raconteur's Commonplace — minimal plain HTML for Kobo / E-Ink.
 * Live navigation uses POST (Supabase cannot serve HTML on GET).
 */

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

/** Always the bare function root — never derive from request path. */
export function catalogueEndpoint(supabaseUrl) {
  return String(supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/catalogue';
}

function formAction(actionBase, apiKey) {
  // Fixed root + apikey only. No extra query params, no trailing slash.
  let base = String(actionBase || '').replace(/\/$/, '');
  const q = base.indexOf('?');
  if (q !== -1) base = base.slice(0, q);
  // Strip accidental path segments after /catalogue
  const marker = '/functions/v1/catalogue';
  const at = base.indexOf(marker);
  if (at !== -1) {
    base = base.slice(0, at + marker.length);
  }
  if (!apiKey) return base;
  return base + '?apikey=' + encodeURIComponent(apiKey);
}

function postNav(actionBase, apiKey, label, fields, btnClass) {
  let inputs =
    '<input type="hidden" name="action" value="' +
    escapeAttr(fields.action || 'view') +
    '">';
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'action') continue;
    const v = fields[k];
    if (v === undefined || v === null || v === '') continue;
    inputs +=
      '<input type="hidden" name="' +
      escapeAttr(k) +
      '" value="' +
      escapeAttr(String(v)) +
      '">';
  }
  return (
    '<form class="inline" method="post" action="' +
    escapeAttr(formAction(actionBase, apiKey)) +
    '">' +
    inputs +
    '<input class="' +
    escapeAttr(btnClass || 'linkbtn') +
    '" type="submit" value="' +
    escapeAttr(label) +
    '">' +
    '</form>'
  );
}

function availabilityLabel(value) {
  if (value === 'on_loan') return 'On loan';
  if (value === 'reserved') return 'Reserved';
  if (value === 'unavailable') return 'Unavailable';
  return 'Available';
}

function formatLabel(format) {
  if (format === 'hardcover') return 'Hardcover';
  if (format === 'ebook') return 'Ebook';
  if (format === 'other') return 'Other';
  return 'Paperback';
}

function safeCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    sensitivity: 'base',
  });
}

function firstLetter(title) {
  const t = String(title || '').replace(/^\s+/, '');
  if (!t) return '#';
  const ch = t.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function allGenres(books) {
  const set = {};
  const list = [];
  for (let i = 0; i < books.length; i++) {
    const genres = books[i].genres || [];
    for (let j = 0; j < genres.length; j++) {
      const g = String(genres[j] || '').trim();
      if (!g) continue;
      const key = g.toLowerCase();
      if (!set[key]) {
        set[key] = 1;
        list.push(g);
      }
    }
  }
  list.sort(safeCompare);
  return list;
}

function filterAndSortBooks(books, opts) {
  const q = String(opts.query || '')
    .replace(/^\s+|\s+$/g, '')
    .toLowerCase();
  const letter = String(opts.letter || '').toUpperCase();
  const genre = String(opts.genre || '').toLowerCase();
  const sort = opts.sort || 'title';

  let list = [];
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (letter && firstLetter(b.title) !== letter) continue;
    if (genre) {
      const genres = b.genres || [];
      let hit = false;
      for (let j = 0; j < genres.length; j++) {
        if (String(genres[j] || '').toLowerCase() === genre) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }
    if (q) {
      const hay = [
        b.title,
        b.author,
        b.description || '',
        b.keywords || '',
        (b.genres || []).join(' '),
        b.format,
        b.publisher || '',
        b.isbn || '',
        b.availability || '',
        b.year != null ? String(b.year) : '',
      ]
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    list.push(b);
  }

  list = list.slice();
  if (sort === 'author') {
    list.sort(function (a, b) {
      return safeCompare(a.author, b.author) || safeCompare(a.title, b.title);
    });
  } else if (sort === 'genre') {
    list.sort(function (a, b) {
      const ga = (a.genres && a.genres[0]) || '';
      const gb = (b.genres && b.genres[0]) || '';
      return safeCompare(ga, gb) || safeCompare(a.title, b.title);
    });
  } else if (sort === 'recent') {
    list.sort(function (a, b) {
      return String(a.created_at || '') < String(b.created_at || '')
        ? 1
        : String(a.created_at || '') > String(b.created_at || '')
          ? -1
          : 0;
    });
  } else {
    list.sort(function (a, b) {
      return safeCompare(a.title, b.title);
    });
  }
  return list;
}

function css() {
  return [
    'html,body{margin:0;padding:0;background:#fff;color:#000;}',
    'body{font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.35;}',
    'h1,h2{font-family:Georgia,"Times New Roman",serif;font-weight:bold;margin:0;}',
    'table{border-collapse:collapse;width:100%;}',
    'td{vertical-align:top;}',
    '.page{width:94%;max-width:820px;margin:0 auto;padding:18px 10px 36px 10px;}',
    '.top{width:100%;margin:0 0 14px 0;border-bottom:1px solid #000;padding-bottom:14px;}',
    '.top td{vertical-align:middle;padding:0;}',
    '.brand{font-size:28px;line-height:1.1;margin:0;}',
    '.kicker{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin:8px 0 0 0;}',
    '.btn-full{display:inline-block;border:2px solid #000;background:#000;color:#fff;padding:12px 16px;font-size:15px;font-family:Georgia,"Times New Roman",serif;cursor:pointer;white-space:nowrap;text-decoration:none;}',
    '.nav{width:100%;margin:0 0 16px 0;}',
    '.nav td{padding:0 6px 0 0;width:33%;}',
    '.navbtn{display:block;width:100%;border:2px solid #000;background:#fff;color:#000;padding:16px 6px;font-size:18px;font-family:Georgia,"Times New Roman",serif;cursor:pointer;}',
    '.navbtn-on{background:#000;color:#fff;}',
    '.btn{border:2px solid #000;background:#fff;color:#000;padding:12px 16px;font:inherit;cursor:pointer;}',
    '.btn-large{display:block;width:100%;text-align:center;padding:48px 14px;margin:0 0 18px 0;font-size:30px;font-family:Georgia,"Times New Roman",serif;border:3px solid #000;line-height:1.2;}',
    '.linkbtn{background:none;border:0;padding:0;margin:0;color:#000;text-decoration:underline;font:inherit;cursor:pointer;}',
    'form.inline{display:inline;margin:0;padding:0;}',
    'form.block{display:block;margin:0;padding:0;}',
    'input[type=text],input[type=search],select{width:98%;border:1px solid #000;background:#fff;padding:12px;font-size:17px;}',
    '.field{margin:0 0 12px 0;}',
    '.tools td{padding:0 8px 10px 0;}',
    '.letters{margin:0 0 14px 0;line-height:2.1;}',
    '.letters .inline{margin:0 8px 0 0;}',
    '.books td{border-top:1px solid #000;padding:14px 0;font-size:16px;}',
    '.books .title{font-family:Georgia,"Times New Roman",serif;font-size:19px;}',
    '.books .meta{font-size:14px;margin-top:4px;}',
    '.empty{border:1px solid #000;padding:16px;margin:10px 0;}',
    '.status{border:1px solid #000;padding:10px;margin:0 0 12px 0;}',
    '.card{border:2px solid #000;padding:18px;margin:4px 0 0 0;}',
    '.card h2{font-size:28px;margin:0 0 6px 0;}',
    '.card .by{font-size:18px;margin:0 0 14px 0;font-family:Georgia,"Times New Roman",serif;}',
    '.card .meta{margin:0 0 12px 0;font-size:15px;}',
    '.card .desc{margin:0;}',
  ].join('');
}

function siteHeader(opts) {
  const pagesHome = String(opts.pagesHome || './').replace(/\/?$/, '/');
  const fullHref = pagesHome + 'full/';
  return (
    '<table class="top"><tr>' +
    '<td>' +
    '<h1 class="brand">The Raconteur&#39;s Commonplace</h1>' +
    '<p class="kicker">Personal Library Catalogue</p>' +
    '</td>' +
    '<td align="right">' +
    '<a class="btn-full" href="' +
    escapeAttr(fullHref) +
    '">Full Experience</a>' +
    '</td>' +
    '</tr></table>\n'
  );
}

function mainNav(opts, active) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const items = [
    { view: 'home', label: 'Home' },
    { view: 'find', label: 'Find' },
    { view: 'browse', label: 'Browse' },
  ];
  let html = '<table class="nav"><tr>';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const on = active === item.view ? ' navbtn-on' : '';
    html += '<td>';
    html +=
      '<form class="block" method="post" action="' +
      escapeAttr(formAction(actionBase, apiKey)) +
      '">' +
      '<input type="hidden" name="action" value="view">' +
      '<input type="hidden" name="view" value="' +
      escapeAttr(item.view) +
      '">' +
      '<input class="navbtn' +
      on +
      '" type="submit" value="' +
      escapeAttr(item.label) +
      '">' +
      '</form>';
    html += '</td>';
  }
  html += '</tr></table>';
  return html;
}

function shellStart(opts, title, active, showNav) {
  let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html += '<meta charset="utf-8">\n';
  html +=
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  html += '<title>' + escapeHtml(title) + '</title>\n';
  html += '<style type="text/css">' + css() + '</style>\n';
  html += '</head>\n<body>\n<div class="page">\n';
  html += siteHeader(opts);
  if (showNav !== false) {
    html += mainNav(opts, active);
  }
  if (opts.status) {
    html += '<div class="status">' + escapeHtml(opts.status) + '</div>';
  }
  return html;
}

function shellEnd() {
  return '</div>\n</body>\n</html>';
}

function bookResultRows(books, actionBase, apiKey) {
  if (!books.length) {
    return '<div class="empty">No books found.</div>';
  }
  let html = '<table class="books">';
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    const genres = (b.genres || []).join(', ');
    const bits = [b.author || 'Unknown author'];
    if (genres) bits.push(genres);
    bits.push(availabilityLabel(b.availability));
    html += '<tr><td>';
    html +=
      '<div class="title">' +
      postNav(actionBase, apiKey, b.title || 'Untitled', {
        action: 'view',
        view: 'book',
        id: b.id,
      }) +
      '</div>';
    html +=
      '<div class="meta">' + escapeHtml(bits.join(' · ')) + '</div>';
    html += '</td></tr>';
  }
  html += '</table>';
  return html;
}

function renderHome(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  // No top nav — the two large buttons replace the old “full experience” entry.
  let html = shellStart(opts, "The Raconteur's Commonplace", 'home', false);
  html +=
    '<form class="block" method="post" action="' +
    escapeAttr(formAction(actionBase, apiKey)) +
    '">' +
    '<input type="hidden" name="action" value="view">' +
    '<input type="hidden" name="view" value="find">' +
    '<input class="btn btn-large" type="submit" value="Find a Book">' +
    '</form>';
  html +=
    '<form class="block" method="post" action="' +
    escapeAttr(formAction(actionBase, apiKey)) +
    '">' +
    '<input type="hidden" name="action" value="view">' +
    '<input type="hidden" name="view" value="browse">' +
    '<input class="btn btn-large" type="submit" value="Browse Library">' +
    '</form>';
  html += shellEnd();
  return html;
}

function renderFind(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const query = opts.query || '';
  const searched = !!opts.searched;
  const results = searched
    ? filterAndSortBooks(opts.books || [], { query: query, sort: 'title' })
    : [];

  let html = shellStart(opts, 'Find', 'find');
  html +=
    '<form method="post" action="' +
    escapeAttr(formAction(actionBase, apiKey)) +
    '">';
  html += '<input type="hidden" name="action" value="view">';
  html += '<input type="hidden" name="view" value="find">';
  html += '<input type="hidden" name="searched" value="1">';
  html +=
    '<div class="field"><input type="search" name="q" value="' +
    escapeAttr(query) +
    '" placeholder="Title, author, genre…"></div>';
  html += '<p><input class="btn" type="submit" value="Search"></p>';
  html += '</form>';

  if (searched) {
    html += bookResultRows(results, actionBase, apiKey);
  }

  html += shellEnd();
  return html;
}

function letterBar(actionBase, apiKey, genre, sort) {
  const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let html = '<div class="letters">';
  html += postNav(actionBase, apiKey, 'All', {
    action: 'view',
    view: 'browse',
    genre: genre || undefined,
    sort: sort || undefined,
  });
  for (let i = 0; i < letters.length; i++) {
    const L = letters.charAt(i);
    html += ' ';
    html += postNav(actionBase, apiKey, L, {
      action: 'view',
      view: 'browse',
      letter: L,
      genre: genre || undefined,
      sort: sort || undefined,
    });
  }
  html += '</div>';
  return html;
}

function renderBrowse(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const letter = opts.letter || '';
  const genre = opts.genre || '';
  const sort = opts.sort || 'title';
  const genres = allGenres(opts.books || []);
  const results = filterAndSortBooks(opts.books || [], {
    letter: letter,
    genre: genre,
    sort: sort,
  });

  let html = shellStart(opts, 'Browse', 'browse');
  html += letterBar(actionBase, apiKey, genre, sort);

  html +=
    '<form method="post" action="' +
    escapeAttr(formAction(actionBase, apiKey)) +
    '">';
  html += '<input type="hidden" name="action" value="view">';
  html += '<input type="hidden" name="view" value="browse">';
  if (letter) {
    html +=
      '<input type="hidden" name="letter" value="' +
      escapeAttr(letter) +
      '">';
  }
  html += '<table class="tools"><tr>';
  html +=
    '<td width="50%"><select name="genre"><option value="">All genres</option>';
  for (let i = 0; i < genres.length; i++) {
    const g = genres[i];
    const sel =
      String(genre).toLowerCase() === String(g).toLowerCase() ? ' selected' : '';
    html +=
      '<option value="' +
      escapeAttr(g) +
      '"' +
      sel +
      '>' +
      escapeHtml(g) +
      '</option>';
  }
  html += '</select></td>';
  html += '<td width="50%"><select name="sort">';
  html +=
    '<option value="title"' +
    (sort === 'title' ? ' selected' : '') +
    '>Title</option>';
  html +=
    '<option value="author"' +
    (sort === 'author' ? ' selected' : '') +
    '>Author</option>';
  html +=
    '<option value="genre"' +
    (sort === 'genre' ? ' selected' : '') +
    '>Genre</option>';
  html += '</select></td></tr>';
  html +=
    '<tr><td colspan="2"><input class="btn" type="submit" value="Apply"></td></tr>';
  html += '</table></form>';

  html += bookResultRows(results, actionBase, apiKey);
  html += shellEnd();
  return html;
}

function renderBook(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const book = opts.editBook;
  let html = shellStart(opts, book ? book.title : 'Book', 'browse');

  if (!book) {
    html += '<div class="empty">Book not found.</div>';
    html += shellEnd();
    return html;
  }

  let shelfName = 'Unshelved';
  const shelves = opts.shelves || [];
  for (let i = 0; i < shelves.length; i++) {
    if (shelves[i].id === book.shelf_id) {
      shelfName = shelves[i].name;
      break;
    }
  }
  const genres = (book.genres || []).join(', ');
  const bits = [
    availabilityLabel(book.availability),
    formatLabel(book.format) + (book.is_digital ? ' · Digital' : ''),
    shelfName,
  ];
  if (genres) bits.splice(1, 0, genres);

  html += '<div class="card">';
  html += '<h2>' + escapeHtml(book.title || 'Untitled') + '</h2>';
  html +=
    '<p class="by">' + escapeHtml(book.author || 'Unknown author') + '</p>';
  html +=
    '<p class="meta">' + escapeHtml(bits.join(' · ')) + '</p>';
  if (book.description) {
    html +=
      '<p class="desc">' + escapeHtml(book.description) + '</p>';
  }
  const extras = [];
  if (book.publisher) extras.push(book.publisher);
  if (book.year != null) extras.push(String(book.year));
  if (book.isbn) extras.push('ISBN ' + book.isbn);
  if (extras.length) {
    html +=
      '<p class="meta">' + escapeHtml(extras.join(' · ')) + '</p>';
  }
  html += '</div>';
  html += shellEnd();
  return html;
}

export function renderPage(opts) {
  const view = opts.view || 'home';
  if (view === 'find') return renderFind(opts);
  if (view === 'browse') return renderBrowse(opts);
  if (view === 'book') return renderBook(opts);
  return renderHome(opts);
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/^\s+|\s+$/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseGenres(raw) {
  return String(raw || '')
    .split(',')
    .map(function (g) {
      return g.replace(/^\s+|\s+$/g, '');
    })
    .filter(Boolean);
}

export function buildUrl(actionBase, apiKey, params) {
  const parts = [];
  if (apiKey) parts.push('apikey=' + encodeURIComponent(apiKey));
  if (params) {
    const keys = Object.keys(params);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = params[k];
      if (v === undefined || v === null || v === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
  }
  const base = formAction(actionBase, '').replace(/\/$/, '');
  return base + (parts.length ? '?' + parts.join('&') : '');
}
