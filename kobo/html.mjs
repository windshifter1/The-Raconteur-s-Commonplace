/**
 * The Raconteur's Commonplace — plain HTML for Kobo / E-Ink.
 * Supabase GET cannot serve HTML (forced text/plain), so live nav uses POST forms.
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
  return actionBase + (parts.length ? '?' + parts.join('&') : '');
}

function endpoint(actionBase, apiKey) {
  return buildUrl(actionBase, apiKey, {});
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
  const cls = btnClass || 'linkbtn';
  return (
    '<form class="inline" method="post" action="' +
    escapeAttr(endpoint(actionBase, apiKey)) +
    '">' +
    inputs +
    '<input class="' +
    escapeAttr(cls) +
    '" type="submit" value="' +
    escapeAttr(label) +
    '">' +
    '</form>'
  );
}

function formatLabel(format) {
  if (format === 'hardcover') return 'Hardcover';
  if (format === 'ebook') return 'Ebook';
  if (format === 'other') return 'Other';
  return 'Paperback';
}

function availabilityLabel(value) {
  if (value === 'on_loan') return 'On loan';
  if (value === 'reserved') return 'Reserved';
  if (value === 'unavailable') return 'Unavailable';
  return 'Available';
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
    'body{font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.45;}',
    'a{color:#000;}',
    'h1,h2,h3{font-family:Georgia,"Times New Roman",serif;font-weight:bold;margin:0;}',
    'table{border-collapse:collapse;}',
    'td,th{vertical-align:top;}',
    '.page{width:94%;max-width:900px;margin:0 auto;padding:22px 12px 48px 12px;}',
    '.brand{font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1.15;margin:0;}',
    '.kicker{font-size:11px;letter-spacing:0.16em;text-transform:uppercase;margin:8px 0 0 0;}',
    '.top{width:100%;margin-bottom:18px;border-bottom:1px solid #000;padding-bottom:14px;}',
    '.top td{padding:0;vertical-align:middle;}',
    '.nav .inline{display:inline;margin-left:12px;}',
    '.btn{display:inline-block;border:1px solid #000;padding:10px 16px;text-decoration:none;background:#fff;color:#000;font:inherit;cursor:pointer;}',
    '.btn-large{display:block;width:100%;text-align:center;padding:28px 16px;margin:0 0 16px 0;font-size:22px;font-family:Georgia,"Times New Roman",serif;}',
    '.linkbtn{background:none;border:0;padding:0;margin:0;color:#000;text-decoration:underline;font:inherit;cursor:pointer;}',
    'form.inline{display:inline;margin:0;padding:0;}',
    '.label{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:bold;margin:0 0 10px 0;}',
    '.hero{font-size:30px;margin:0 0 10px 0;}',
    '.lead{font-family:Georgia,"Times New Roman",serif;font-size:16px;margin:0 0 18px 0;}',
    '.rule{border:0;border-top:1px solid #000;margin:16px 0;}',
    '.rule-thick{border:0;border-top:2px solid #000;margin:18px 0;}',
    '.home-options{margin-top:28px;}',
    '.field{margin:0 0 12px 0;}',
    '.field .lbl{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin:0 0 4px 0;}',
    'input[type=text],input[type=search],select,textarea{width:98%;border:1px solid #000;background:#fff;color:#000;padding:9px;font-size:15px;font-family:Arial,Helvetica,sans-serif;}',
    'textarea{height:90px;}',
    '.tools{width:100%;margin:0 0 16px 0;}',
    '.tools td{padding:0 10px 10px 0;}',
    '.letters{margin:0 0 14px 0;line-height:1.9;}',
    '.letters .inline{margin-right:8px;}',
    '.books{width:100%;border-top:1px solid #000;}',
    '.books td{border-bottom:1px solid #000;padding:12px 8px 12px 0;font-size:15px;}',
    '.books .title{font-family:Georgia,"Times New Roman",serif;font-size:17px;}',
    '.books .meta{font-size:13px;}',
    '.empty{padding:18px 12px;border:1px solid #000;margin:12px 0;}',
    '.status{border:1px solid #000;padding:8px 10px;margin:0 0 14px 0;}',
    '.card{border:1px solid #000;padding:18px;margin:12px 0 20px 0;}',
    '.card h2{font-size:28px;margin:0 0 8px 0;}',
    '.card .byline{font-family:Georgia,"Times New Roman",serif;font-size:18px;margin:0 0 14px 0;}',
    '.card .row{margin:0 0 10px 0;}',
    '.card .lbl{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;}',
    '.footer-note{margin-top:28px;font-size:12px;}',
    '.crumb{margin:0 0 16px 0;font-size:14px;}',
  ].join('');
}

function shellStart(opts, title) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  let html = '';
  html += '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html += '<meta charset="utf-8">\n';
  html +=
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  html += '<title>' + escapeHtml(title) + '</title>\n';
  html += '<style type="text/css">' + css() + '</style>\n';
  html += '</head>\n<body>\n<div class="page">\n';
  html += '<table class="top" width="100%"><tr>';
  html +=
    '<td><h1 class="brand">The Raconteur&#39;s Commonplace</h1>' +
    '<p class="kicker">Personal library / catalogue</p></td>';
  html += '<td align="right" class="nav">';
  html += postNav(actionBase, apiKey, 'Home', { action: 'view', view: 'home' });
  html += postNav(actionBase, apiKey, 'Find', { action: 'view', view: 'find' });
  html += postNav(actionBase, apiKey, 'Browse', {
    action: 'view',
    view: 'browse',
  });
  html += '</td></tr></table>\n';
  if (opts.status) {
    html += '<div class="status">' + escapeHtml(opts.status) + '</div>';
  }
  return html;
}

function shellEnd(opts) {
  let html = '';
  html +=
    '<p class="footer-note">Plain catalogue for E-Ink and simple browsers. No scripts.</p>';
  if (opts.pagesHome) {
    html +=
      '<p class="footer-note"><a href="' +
      escapeAttr(opts.pagesHome) +
      '">' +
      escapeHtml(opts.pagesHome) +
      '</a></p>';
  }
  html += '</div>\n</body>\n</html>';
  return html;
}

function renderHome(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  let html = shellStart(opts, "The Raconteur's Commonplace");
  html += '<p class="label">Library catalogue</p>';
  html += '<h2 class="hero">Where to begin?</h2>';
  html +=
    '<p class="lead">A plain index of the stories, ideas, and places kept close.</p>';
  html += '<div class="home-options">';
  html +=
    '<form method="post" action="' +
    escapeAttr(endpoint(actionBase, apiKey)) +
    '">' +
    '<input type="hidden" name="action" value="view">' +
    '<input type="hidden" name="view" value="find">' +
    '<input class="btn btn-large" type="submit" value="Find a Book">' +
    '</form>';
  html +=
    '<form method="post" action="' +
    escapeAttr(endpoint(actionBase, apiKey)) +
    '">' +
    '<input type="hidden" name="action" value="view">' +
    '<input type="hidden" name="view" value="browse">' +
    '<input class="btn btn-large" type="submit" value="Browse Library">' +
    '</form>';
  html += '</div>';
  html +=
    '<p class="footer-note">' +
    (opts.books || []).length +
    ' title' +
    ((opts.books || []).length === 1 ? '' : 's') +
    ' on ' +
    (opts.shelves || []).length +
    ' shelf' +
    ((opts.shelves || []).length === 1 ? '' : 'ves') +
    '.</p>';
  html += shellEnd(opts);
  return html;
}

function bookResultRows(books, actionBase, apiKey) {
  if (!books.length) {
    return (
      '<div class="empty">' +
      '<strong>No books found.</strong><br>' +
      'Nothing matched your search or filters. Try fewer words, another spelling, or clear the filters and browse again.' +
      '</div>'
    );
  }
  let html = '<table class="books" width="100%">';
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    const genres = (b.genres || []).join(', ') || '—';
    html += '<tr>';
    html +=
      '<td class="title">' +
      postNav(actionBase, apiKey, b.title || 'Untitled', {
        action: 'view',
        view: 'book',
        id: b.id,
      }) +
      '<div class="meta">' +
      escapeHtml(b.author || 'Unknown author') +
      ' · ' +
      escapeHtml(genres) +
      ' · ' +
      escapeHtml(availabilityLabel(b.availability)) +
      '</div></td>';
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function renderFind(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const query = opts.query || '';
  const searched = !!opts.searched;
  const results = searched
    ? filterAndSortBooks(opts.books || [], {
        query: query,
        sort: 'title',
      })
    : [];

  let html = shellStart(opts, 'Find a Book — The Raconteur\'s Commonplace');
  html +=
    '<p class="crumb">' +
    postNav(actionBase, apiKey, 'Home', { action: 'view', view: 'home' }) +
    ' / Find a Book</p>';
  html += '<p class="label">Find a Book</p>';
  html += '<h2 class="hero">Search the catalogue.</h2>';
  html +=
    '<p class="lead">Search by title, author, genre, keywords, publisher, or ISBN.</p>';
  html +=
    '<form method="post" action="' +
    escapeAttr(endpoint(actionBase, apiKey)) +
    '">';
  html += '<input type="hidden" name="action" value="view">';
  html += '<input type="hidden" name="view" value="find">';
  html += '<input type="hidden" name="searched" value="1">';
  html +=
    '<div class="field"><div class="lbl">Search</div>' +
    '<input type="search" name="q" value="' +
    escapeAttr(query) +
    '" placeholder="e.g. Le Guin, fantasy, ISBN">' +
    '</div>';
  html += '<p><input class="btn" type="submit" value="Search"></p>';
  html += '</form>';
  html += '<hr class="rule">';

  if (!searched) {
    html +=
      '<div class="empty">Enter a word or phrase above, then press Search.</div>';
  } else {
    html +=
      '<p class="label">' +
      results.length +
      ' result' +
      (results.length === 1 ? '' : 's') +
      (query ? ' for “' + escapeHtml(query) + '”' : '') +
      '</p>';
    html += bookResultRows(results, actionBase, apiKey);
  }

  html += shellEnd(opts);
  return html;
}

function letterBar(actionBase, apiKey, active, genre, sort) {
  const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let html = '<div class="letters">';
  html += postNav(
    actionBase,
    apiKey,
    'All',
    {
      action: 'view',
      view: 'browse',
      genre: genre || undefined,
      sort: sort || undefined,
    },
    active ? 'linkbtn' : 'linkbtn'
  );
  for (let i = 0; i < letters.length; i++) {
    const L = letters.charAt(i);
    html += ' ';
    const fields = {
      action: 'view',
      view: 'browse',
      letter: L,
      genre: genre || undefined,
      sort: sort || undefined,
    };
    html += postNav(actionBase, apiKey, L, fields);
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

  let html = shellStart(opts, 'Browse Library — The Raconteur\'s Commonplace');
  html +=
    '<p class="crumb">' +
    postNav(actionBase, apiKey, 'Home', { action: 'view', view: 'home' }) +
    ' / Browse Library</p>';
  html += '<p class="label">Browse Library</p>';
  html += '<h2 class="hero">Walk the shelves.</h2>';
  html +=
    '<p class="lead">Filter by first letter or genre, and sort by title, author, or genre.</p>';

  html += letterBar(actionBase, apiKey, !letter, genre, sort);

  html +=
    '<form method="post" action="' +
    escapeAttr(endpoint(actionBase, apiKey)) +
    '">';
  html += '<input type="hidden" name="action" value="view">';
  html += '<input type="hidden" name="view" value="browse">';
  if (letter) {
    html +=
      '<input type="hidden" name="letter" value="' +
      escapeAttr(letter) +
      '">';
  }
  html += '<table class="tools" width="100%"><tr>';
  html +=
    '<td width="50%"><div class="lbl">Genre</div><select name="genre">' +
    '<option value="">All genres</option>';
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
  html +=
    '<td width="50%"><div class="lbl">Sort by</div><select name="sort">';
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
  html +=
    '<option value="recent"' +
    (sort === 'recent' ? ' selected' : '') +
    '>Recently added</option>';
  html += '</select></td></tr>';
  html +=
    '<tr><td colspan="2"><input class="btn" type="submit" value="Apply filters"></td></tr>';
  html += '</table></form>';
  html += '<hr class="rule">';
  html +=
    '<p class="label">' +
    results.length +
    ' title' +
    (results.length === 1 ? '' : 's') +
    (letter ? ' · letter ' + escapeHtml(letter) : '') +
    (genre ? ' · ' + escapeHtml(genre) : '') +
    '</p>';
  html += bookResultRows(results, actionBase, apiKey);
  html += shellEnd(opts);
  return html;
}

function renderBook(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const book = opts.editBook;
  let html = shellStart(opts, book ? book.title + ' — Catalogue' : 'Book');

  html +=
    '<p class="crumb">' +
    postNav(actionBase, apiKey, 'Home', { action: 'view', view: 'home' }) +
    ' / ' +
    postNav(actionBase, apiKey, 'Browse', { action: 'view', view: 'browse' }) +
    ' / Title</p>';

  if (!book) {
    html += '<p class="label">Title</p>';
    html += '<h2 class="hero">Book not found</h2>';
    html +=
      '<div class="empty">That title is not in the catalogue. It may have been removed, or the link is out of date.</div>';
    html +=
      '<p>' +
      postNav(actionBase, apiKey, 'Back to Browse', {
        action: 'view',
        view: 'browse',
      }) +
      ' · ' +
      postNav(actionBase, apiKey, 'Find a Book', {
        action: 'view',
        view: 'find',
      }) +
      '</p>';
    html += shellEnd(opts);
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

  const genres = (book.genres || []).join(', ') || '—';

  html += '<p class="label">Title record</p>';
  html += '<div class="card">';
  html += '<h2>' + escapeHtml(book.title || 'Untitled') + '</h2>';
  html +=
    '<p class="byline">' +
    escapeHtml(book.author || 'Unknown author') +
    '</p>';
  html +=
    '<div class="row"><div class="lbl">Availability</div>' +
    escapeHtml(availabilityLabel(book.availability)) +
    '</div>';
  html +=
    '<div class="row"><div class="lbl">Genre</div>' +
    escapeHtml(genres) +
    '</div>';
  html +=
    '<div class="row"><div class="lbl">Description</div>' +
    escapeHtml(
      book.description || 'No description has been added for this title yet.'
    ) +
    '</div>';
  html += '<hr class="rule">';
  html +=
    '<div class="row"><div class="lbl">Format</div>' +
    escapeHtml(formatLabel(book.format)) +
    (book.is_digital ? ' · Digital edition' : '') +
    '</div>';
  html +=
    '<div class="row"><div class="lbl">Shelf</div>' +
    escapeHtml(shelfName) +
    '</div>';
  if (book.publisher) {
    html +=
      '<div class="row"><div class="lbl">Publisher</div>' +
      escapeHtml(book.publisher) +
      '</div>';
  }
  if (book.year != null) {
    html +=
      '<div class="row"><div class="lbl">Year</div>' +
      escapeHtml(String(book.year)) +
      '</div>';
  }
  if (book.isbn) {
    html +=
      '<div class="row"><div class="lbl">ISBN</div>' +
      escapeHtml(book.isbn) +
      '</div>';
  }
  if (book.keywords) {
    html +=
      '<div class="row"><div class="lbl">Keywords</div>' +
      escapeHtml(book.keywords) +
      '</div>';
  }
  html += '</div>';

  html += '<p>';
  html += postNav(actionBase, apiKey, 'Back to Browse', {
    action: 'view',
    view: 'browse',
  });
  html += ' · ';
  html += postNav(actionBase, apiKey, 'Find a Book', {
    action: 'view',
    view: 'find',
  });
  html += ' · ';
  html += postNav(actionBase, apiKey, 'Home', {
    action: 'view',
    view: 'home',
  });
  html += '</p>';
  html += shellEnd(opts);
  return html;
}

/**
 * @param {object} opts
 */
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
