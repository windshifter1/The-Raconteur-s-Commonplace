/**
 * Plain HTML for Kobo / ancient WebKit.
 * Important: Supabase Edge GET responses cannot serve HTML (forced to text/plain).
 * All live navigation therefore uses POST forms, which keep Content-Type: text/html.
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

/** Endpoint URL with apikey query (Supabase gateway needs it). */
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

function postAction(actionBase, apiKey) {
  return buildUrl(actionBase, apiKey, {});
}

/** Button styled as a link — works without JS on Kobo. */
function postNav(actionBase, apiKey, label, fields) {
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
    escapeAttr(postAction(actionBase, apiKey)) +
    '">' +
    inputs +
    '<input class="linkbtn" type="submit" value="' +
    escapeAttr(label) +
    '">' +
    '</form>'
  );
}

function formatLabel(format) {
  if (format === 'hardcover') return 'HARDCOVER';
  if (format === 'ebook') return 'EBOOK';
  if (format === 'other') return 'OTHER';
  return 'PAPERBACK';
}

function countByShelf(books) {
  const map = {};
  for (let i = 0; i < books.length; i++) {
    const id = books[i].shelf_id;
    if (!id) continue;
    map[id] = (map[id] || 0) + 1;
  }
  return map;
}

function uniqueGenreCount(books) {
  const seen = {};
  let n = 0;
  for (let i = 0; i < books.length; i++) {
    const genres = books[i].genres || [];
    for (let j = 0; j < genres.length; j++) {
      const key = String(genres[j]).toLowerCase();
      if (!seen[key]) {
        seen[key] = 1;
        n += 1;
      }
    }
  }
  return n;
}

function sortBooks(books, sort) {
  const list = books.slice();
  if (sort === 'title') {
    list.sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
  } else if (sort === 'author') {
    list.sort(function (a, b) {
      return a.author.localeCompare(b.author) || a.title.localeCompare(b.title);
    });
  } else {
    list.sort(function (a, b) {
      return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
    });
  }
  return list;
}

function filterBooks(books, opts) {
  let list = books;
  if (opts.shelfId) {
    list = list.filter(function (b) {
      return b.shelf_id === opts.shelfId;
    });
  }
  const q = (opts.query || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  if (q) {
    list = list.filter(function (b) {
      const hay = [
        b.title,
        b.author,
        b.keywords || '',
        (b.genres || []).join(' '),
        b.format,
      ]
        .join(' ')
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  return sortBooks(list, opts.sort || 'recent');
}

function css() {
  return [
    'html,body{margin:0;padding:0;background:#fff;color:#000;}',
    'body{font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;}',
    'a{color:#000;}',
    'h1,h2,h3{font-family:Georgia,"Times New Roman",serif;font-weight:bold;margin:0;}',
    'table{border-collapse:collapse;}',
    'td,th{vertical-align:top;}',
    '.page{width:96%;max-width:1100px;margin:0 auto;padding:18px 12px 40px 12px;}',
    '.brand{font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1.15;margin:0;}',
    '.kicker{font-size:11px;letter-spacing:0.16em;text-transform:uppercase;margin:8px 0 0 0;}',
    '.top{width:100%;margin-bottom:14px;border-bottom:1px solid #000;padding-bottom:12px;}',
    '.top td{padding:0;}',
    '.nav .inline{display:inline;margin-left:14px;}',
    '.btn{display:inline-block;border:1px solid #000;padding:6px 12px;text-decoration:none;background:#fff;color:#000;}',
    'input.btn{font:inherit;cursor:pointer;}',
    '.linkbtn{background:none;border:0;padding:0;margin:0;color:#000;text-decoration:underline;font:inherit;cursor:pointer;}',
    'form.inline{display:inline;margin:0;padding:0;}',
    '.layout{width:100%;}',
    '.sidebar{width:210px;padding:18px 16px 0 0;border-right:1px solid #000;}',
    '.main{padding:18px 0 0 18px;}',
    '.label{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:bold;margin:0 0 10px 0;}',
    '.shelf{width:100%;margin:0 0 8px 0;}',
    '.shelf td{padding:2px 0;font-size:15px;}',
    '.shelf .count{text-align:right;width:28px;}',
    '.active{font-weight:bold;}',
    '.rule{border:0;border-top:1px solid #000;margin:14px 0;}',
    '.rule-thick{border:0;border-top:2px solid #000;margin:18px 0;}',
    '.hero{font-size:34px;margin:0 0 10px 0;}',
    '.lead{font-family:Georgia,"Times New Roman",serif;font-size:16px;margin:0 0 12px 0;}',
    '.stats span{margin-right:16px;}',
    '.tools{width:100%;margin:0 0 18px 0;}',
    '.tools input,.tools select,input[type=text],input[type=search],select,textarea{width:95%;border:1px solid #000;background:#fff;color:#000;padding:8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;}',
    'textarea{height:70px;}',
    '.section-head{width:100%;margin:22px 0 4px 0;}',
    '.section-head h3{font-size:24px;}',
    '.meta{font-size:12px;text-align:right;}',
    '.books{width:100%;border-top:1px solid #000;}',
    '.books td{border-bottom:1px solid #000;padding:10px 8px 10px 0;font-size:15px;}',
    '.books .title{font-family:Georgia,"Times New Roman",serif;}',
    '.books .fmt{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:bold;white-space:nowrap;}',
    '.books .actions{white-space:nowrap;}',
    '.status{border:1px solid #000;padding:8px 10px;margin:0 0 14px 0;}',
    '.panel{border-top:1px solid #000;border-bottom:1px solid #000;padding:14px 0;margin:0 0 18px 0;}',
    '.panel h3{font-size:22px;margin:0 0 12px 0;}',
    '.form td{padding:0 12px 10px 0;}',
    '.form .lbl{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;}',
    '.empty{padding:12px 0;border-bottom:1px solid #000;}',
    '.footer-note{margin-top:28px;font-size:12px;}',
  ].join('');
}

function bookRows(books, actionBase, apiKey) {
  if (!books.length) {
    return '<tr><td class="empty" colspan="4">No titles match this view.</td></tr>';
  }
  let html = '';
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    html += '<tr>';
    html +=
      '<td class="title">' +
      postNav(actionBase, apiKey, b.title, {
        action: 'view',
        view: 'book',
        id: b.id,
      }) +
      '</td>';
    html += '<td>' + escapeHtml(b.author) + '</td>';
    html +=
      '<td class="fmt">' +
      escapeHtml(formatLabel(b.format)) +
      (b.is_digital ? '<br>Digital edition' : '') +
      '</td>';
    html += '<td class="actions">';
    html += postNav(actionBase, apiKey, 'Edit', {
      action: 'view',
      view: 'edit-book',
      id: b.id,
    });
    html += ' &nbsp; ';
    html += postNav(actionBase, apiKey, 'Delete', {
      action: 'view',
      view: 'confirm-delete',
      id: b.id,
    });
    html += '</td></tr>';
  }
  return html;
}

function shelfList(shelves, books, activeShelfId, actionBase, apiKey, query, sort) {
  const counts = countByShelf(books);
  let html = '';
  html += '<table class="shelf"><tr>';
  html +=
    '<td' +
    (activeShelfId ? '' : ' class="active"') +
    '>' +
    postNav(actionBase, apiKey, 'All books', {
      action: 'view',
      view: 'catalogue',
      q: query || undefined,
      sort: sort !== 'recent' ? sort : undefined,
    }) +
    '</td>';
  html += '<td class="count">' + books.length + '</td></tr></table>';
  for (let i = 0; i < shelves.length; i++) {
    const shelf = shelves[i];
    const active = activeShelfId === shelf.id;
    html += '<table class="shelf"><tr>';
    html +=
      '<td' +
      (active ? ' class="active"' : '') +
      '>' +
      postNav(actionBase, apiKey, shelf.name, {
        action: 'view',
        view: 'catalogue',
        shelf: shelf.id,
        q: query || undefined,
        sort: sort !== 'recent' ? sort : undefined,
      }) +
      '</td>';
    html += '<td class="count">' + (counts[shelf.id] || 0) + '</td></tr></table>';
  }
  html += '<hr class="rule">';
  html += postNav(actionBase, apiKey, 'Add a shelf', {
    action: 'view',
    view: 'add-shelf',
  });
  return html;
}

function renderPanel(view, data, actionBase, apiKey) {
  const shelves = data.shelves;
  const endpoint = postAction(actionBase, apiKey);

  if (view === 'add-book' || view === 'edit-book') {
    const book = data.editBook || null;
    const title = book ? 'Edit book' : 'Add book';
    let shelfOpts = '<option value="">Unshelved</option>';
    for (let i = 0; i < shelves.length; i++) {
      const sel = book && book.shelf_id === shelves[i].id ? ' selected' : '';
      shelfOpts +=
        '<option value="' +
        escapeAttr(shelves[i].id) +
        '"' +
        sel +
        '>' +
        escapeHtml(shelves[i].name) +
        '</option>';
    }
    const formats = ['paperback', 'hardcover', 'ebook', 'other'];
    let formatOpts = '';
    for (let i = 0; i < formats.length; i++) {
      const f = formats[i];
      const sel = (book ? book.format : 'paperback') === f ? ' selected' : '';
      formatOpts +=
        '<option value="' + f + '"' + sel + '>' + formatLabel(f) + '</option>';
    }
    return (
      '<div class="panel"><h3>' +
      escapeHtml(title) +
      '</h3>' +
      '<form method="post" action="' +
      escapeAttr(endpoint) +
      '">' +
      '<input type="hidden" name="action" value="' +
      (book ? 'update-book' : 'create-book') +
      '">' +
      (book
        ? '<input type="hidden" name="id" value="' + escapeAttr(book.id) + '">'
        : '') +
      '<table class="form" width="100%">' +
      '<tr><td width="50%"><div class="lbl">Title</div><input type="text" name="title" value="' +
      escapeAttr(book ? book.title : '') +
      '"></td>' +
      '<td width="50%"><div class="lbl">Author</div><input type="text" name="author" value="' +
      escapeAttr(book ? book.author : '') +
      '"></td></tr>' +
      '<tr><td><div class="lbl">Format</div><select name="format">' +
      formatOpts +
      '</select></td>' +
      '<td><div class="lbl">Shelf</div><select name="shelf_id">' +
      shelfOpts +
      '</select></td></tr>' +
      '<tr><td colspan="2"><div class="lbl">Genres</div><input type="text" name="genres" value="' +
      escapeAttr(book ? (book.genres || []).join(', ') : '') +
      '"></td></tr>' +
      '<tr><td colspan="2"><div class="lbl">Keywords</div><input type="text" name="keywords" value="' +
      escapeAttr(book && book.keywords ? book.keywords : '') +
      '"></td></tr>' +
      '<tr><td colspan="2"><label><input type="checkbox" name="is_digital" value="1"' +
      (book && book.is_digital ? ' checked' : '') +
      '> Digital edition</label></td></tr>' +
      '</table>' +
      '<p><input class="btn" type="submit" value="' +
      (book ? 'Save changes' : 'Save book') +
      '"> &nbsp; ' +
      postNav(actionBase, apiKey, 'Cancel', { action: 'view', view: 'catalogue' }) +
      '</p></form></div>'
    );
  }

  if (view === 'add-shelf') {
    return (
      '<div class="panel"><h3>Add a shelf</h3>' +
      '<form method="post" action="' +
      escapeAttr(endpoint) +
      '">' +
      '<input type="hidden" name="action" value="create-shelf">' +
      '<table class="form" width="100%"><tr><td><div class="lbl">Shelf name</div>' +
      '<input type="text" name="name"></td></tr></table>' +
      '<p><input class="btn" type="submit" value="Save shelf"> &nbsp; ' +
      postNav(actionBase, apiKey, 'Cancel', { action: 'view', view: 'catalogue' }) +
      '</p></form></div>'
    );
  }

  if (view === 'confirm-delete' && data.editBook) {
    const book = data.editBook;
    return (
      '<div class="panel"><h3>Delete book</h3>' +
      '<p>Delete &ldquo;' +
      escapeHtml(book.title) +
      '&rdquo; by ' +
      escapeHtml(book.author) +
      '?</p>' +
      '<form method="post" action="' +
      escapeAttr(endpoint) +
      '">' +
      '<input type="hidden" name="action" value="delete-book">' +
      '<input type="hidden" name="id" value="' +
      escapeAttr(book.id) +
      '">' +
      '<p><input class="btn" type="submit" value="Yes, delete"> &nbsp; ' +
      postNav(actionBase, apiKey, 'Cancel', { action: 'view', view: 'catalogue' }) +
      '</p></form></div>'
    );
  }

  return '';
}

export function renderPage(opts) {
  const actionBase = opts.actionBase;
  const apiKey = opts.apiKey || '';
  const pagesHome = opts.pagesHome || '';
  const view = opts.view || 'catalogue';
  const shelfId = opts.shelfId || null;
  const query = opts.query || '';
  const sort = opts.sort || 'recent';
  const shelves = opts.shelves || [];
  const books = opts.books || [];
  const filtered = filterBooks(books, {
    shelfId: shelfId,
    query: query,
    sort: sort,
  });
  const recent = sortBooks(books, 'recent').slice(0, 5);
  const genreCount = uniqueGenreCount(books);
  let shelfLabel = 'All books';
  if (shelfId) {
    for (let i = 0; i < shelves.length; i++) {
      if (shelves[i].id === shelfId) {
        shelfLabel = shelves[i].name;
        break;
      }
    }
  }

  const showRecent = !shelfId && !query && view === 'catalogue';
  const endpoint = postAction(actionBase, apiKey);

  let html = '';
  html += '<!DOCTYPE html>\n';
  html += '<html lang="en">\n<head>\n';
  html += '<meta charset="utf-8">\n';
  html +=
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  html += '<title>The Raconteur&#39;s Commonplace</title>\n';
  html += '<style type="text/css">' + css() + '</style>\n';
  html += '</head>\n<body>\n';
  html += '<div class="page">\n';

  html += '<table class="top" width="100%"><tr>';
  html +=
    '<td><h1 class="brand">The Raconteur&#39;s Commonplace</h1>' +
    '<p class="kicker">Personal library / catalogue</p></td>';
  html += '<td align="right" class="nav">';
  html += postNav(actionBase, apiKey, 'Catalogue', {
    action: 'view',
    view: 'catalogue',
  });
  html += postNav(actionBase, apiKey, 'Enter the full room', {
    action: 'view',
    view: 'room',
  });
  html += ' &nbsp; ';
  html +=
    '<form class="inline" method="post" action="' +
    escapeAttr(endpoint) +
    '">' +
    '<input type="hidden" name="action" value="view">' +
    '<input type="hidden" name="view" value="add-book">' +
    '<input class="btn" type="submit" value="Add book">' +
    '</form>';
  html += '</td></tr></table>\n';

  html += '<table class="layout" width="100%"><tr>\n';
  html += '<td class="sidebar">';
  html += '<p class="label">Browse shelves</p>';
  html += shelfList(shelves, books, shelfId, actionBase, apiKey, query, sort);
  html += '</td>\n';

  html += '<td class="main">';
  if (opts.status) {
    html += '<div class="status">' + escapeHtml(opts.status) + '</div>';
  }

  html += renderPanel(
    view,
    { shelves: shelves, editBook: opts.editBook },
    actionBase,
    apiKey
  );

  if (view === 'room') {
    html += '<p class="label">The full room</p>';
    html += '<h2 class="hero">Coming later.</h2>';
    html +=
      '<p class="lead">A quieter modern reading room will open here in a later chapter. This Kobo page stays plain on purpose.</p>';
  } else if (view === 'book' && opts.editBook) {
    const b = opts.editBook;
    html += '<p class="label">Title</p>';
    html += '<h2 class="hero">' + escapeHtml(b.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(b.author) + '</p>';
    html +=
      '<p>' +
      escapeHtml(formatLabel(b.format)) +
      (b.is_digital ? ' · Digital edition' : '') +
      '</p>';
    if (b.genres && b.genres.length) {
      html += '<p>Genres: ' + escapeHtml(b.genres.join(', ')) + '</p>';
    }
    if (b.keywords) {
      html += '<p>Keywords: ' + escapeHtml(b.keywords) + '</p>';
    }
    html += '<p>';
    html += postNav(actionBase, apiKey, 'Edit', {
      action: 'view',
      view: 'edit-book',
      id: b.id,
    });
    html += ' · ';
    html += postNav(actionBase, apiKey, 'Back to catalogue', {
      action: 'view',
      view: 'catalogue',
    });
    html += '</p>';
  } else if (
    view === 'catalogue' ||
    view === 'add-book' ||
    view === 'edit-book' ||
    view === 'add-shelf' ||
    view === 'confirm-delete'
  ) {
    html += '<p class="label">Catalogue</p>';
    html += '<h2 class="hero">A life in books.</h2>';
    html +=
      '<p class="lead">A plain index of the stories, ideas, and places kept close.</p>';
    html +=
      '<p class="stats"><span>' +
      books.length +
      ' books</span><span>' +
      shelves.length +
      ' shelves</span><span>' +
      genreCount +
      ' genres</span></p>';
    html += '<hr class="rule-thick">';

    html +=
      '<form method="post" action="' + escapeAttr(endpoint) + '">';
    html += '<input type="hidden" name="action" value="view">';
    html += '<input type="hidden" name="view" value="catalogue">';
    if (shelfId) {
      html +=
        '<input type="hidden" name="shelf" value="' +
        escapeAttr(shelfId) +
        '">';
    }
    html += '<table class="tools" width="100%"><tr>';
    html +=
      '<td width="70%"><input type="search" name="q" value="' +
      escapeAttr(query) +
      '" placeholder="Search title, author, or keyword"></td>';
    html += '<td width="30%"><select name="sort">';
    html +=
      '<option value="recent"' +
      (sort === 'recent' ? ' selected' : '') +
      '>Recently added</option>';
    html +=
      '<option value="title"' +
      (sort === 'title' ? ' selected' : '') +
      '>Title A-Z</option>';
    html +=
      '<option value="author"' +
      (sort === 'author' ? ' selected' : '') +
      '>Author A-Z</option>';
    html += '</select></td></tr>';
    html +=
      '<tr><td colspan="2"><input class="btn" type="submit" value="Apply"></td></tr>';
    html += '</table></form>';

    if (showRecent) {
      html +=
        '<table class="section-head" width="100%"><tr><td><h3>Recently added</h3></td>' +
        '<td class="meta">newest arrivals</td></tr></table>';
      html +=
        '<table class="books" width="100%">' +
        bookRows(recent, actionBase, apiKey) +
        '</table>';
    }

    html +=
      '<table class="section-head" width="100%"><tr><td><h3>' +
      escapeHtml(shelfLabel) +
      '</h3></td><td class="meta">' +
      filtered.length +
      ' title' +
      (filtered.length === 1 ? '' : 's') +
      '</td></tr></table>';
    html +=
      '<table class="books" width="100%">' +
      bookRows(filtered, actionBase, apiKey) +
      '</table>';
  }

  html +=
    '<p class="footer-note">Plain HTML for E-Ink. No scripts. Forms use POST (required by the host).</p>';
  if (pagesHome) {
    html +=
      '<p class="footer-note">Home page: <a href="' +
      escapeAttr(pagesHome) +
      '">' +
      escapeHtml(pagesHome) +
      '</a></p>';
  }
  html += '</td></tr></table>\n';
  html += '</div>\n</body>\n</html>';
  return html;
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
