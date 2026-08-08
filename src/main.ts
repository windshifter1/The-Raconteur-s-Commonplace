import './styles.css';
import {
  createBook,
  createShelf,
  deleteBook,
  fetchBooks,
  fetchShelves,
  supabaseConfigError,
  updateBook,
} from './supabase';
import type {
  AppState,
  Book,
  BookFormat,
  BookInput,
  SortOption,
} from './types';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('#app missing');
const app: HTMLDivElement = appRoot;

const state: AppState = {
  shelves: [],
  books: [],
  activeShelfId: null,
  query: '',
  sort: 'recent',
  panel: { kind: 'none' },
  status: null,
  loading: true,
};

init();

async function init(): Promise<void> {
  bindGlobalEvents();
  if (supabaseConfigError) {
    state.loading = false;
    state.status = supabaseConfigError;
    render();
    return;
  }
  await reload();
}

async function reload(): Promise<void> {
  state.loading = true;
  render();
  try {
    const [shelves, books] = await Promise.all([fetchShelves(), fetchBooks()]);
    state.shelves = shelves;
    state.books = books;
    state.status = null;
  } catch (err) {
    state.status = errorMessage(err);
  } finally {
    state.loading = false;
    render();
  }
}

function bindGlobalEvents(): void {
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
}

function onClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const actionEl = target.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  switch (action) {
    case 'filter-all':
      state.activeShelfId = null;
      render();
      break;
    case 'filter-shelf':
      state.activeShelfId = id ?? null;
      render();
      break;
    case 'open-add-book':
      state.panel = { kind: 'add-book' };
      render();
      focusPanel();
      break;
    case 'open-edit-book':
      if (id) {
        state.panel = { kind: 'edit-book', bookId: id };
        render();
        focusPanel();
      }
      break;
    case 'open-add-shelf':
      state.panel = { kind: 'add-shelf' };
      render();
      focusPanel();
      break;
    case 'close-panel':
      state.panel = { kind: 'none' };
      render();
      break;
    case 'delete-book':
      if (id) void handleDeleteBook(id);
      break;
    default:
      break;
  }
}

async function onSubmit(event: Event): Promise<void> {
  const form = event.target as HTMLFormElement | null;
  if (!form) return;
  event.preventDefault();

  const kind = form.dataset.form;
  if (kind === 'book') {
    await handleBookForm(form);
  } else if (kind === 'shelf') {
    await handleShelfForm(form);
  }
}

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  if (target.name === 'query') {
    state.query = target.value;
    render();
    restoreSearchFocus();
  }
}

function onChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;
  if (target.name === 'sort') {
    state.sort = target.value as SortOption;
    render();
  }
}

function restoreSearchFocus(): void {
  const queryInput = app.querySelector<HTMLInputElement>('#query');
  if (!queryInput) return;
  queryInput.focus();
  const end = queryInput.value.length;
  queryInput.setSelectionRange(end, end);
}

async function handleBookForm(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const input = bookInputFromForm(data);
  const bookId = String(data.get('id') || '');

  try {
    if (bookId) {
      await updateBook(bookId, input);
      state.status = 'Book updated.';
    } else {
      await createBook(input);
      state.status = 'Book added.';
    }
    state.panel = { kind: 'none' };
    await reload();
  } catch (err) {
    state.status = errorMessage(err);
    render();
  }
}

async function handleShelfForm(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) {
    state.status = 'Shelf name is required.';
    render();
    return;
  }

  try {
    await createShelf(name);
    state.status = 'Shelf added.';
    state.panel = { kind: 'none' };
    await reload();
  } catch (err) {
    state.status = errorMessage(err);
    render();
  }
}

async function handleDeleteBook(id: string): Promise<void> {
  const book = state.books.find((b) => b.id === id);
  const label = book ? `"${book.title}"` : 'this book';
  if (!window.confirm(`Delete ${label}?`)) return;

  try {
    await deleteBook(id);
    state.status = 'Book deleted.';
    if (state.panel.kind === 'edit-book' && state.panel.bookId === id) {
      state.panel = { kind: 'none' };
    }
    await reload();
  } catch (err) {
    state.status = errorMessage(err);
    render();
  }
}

function bookInputFromForm(data: FormData): BookInput {
  const genresRaw = String(data.get('genres') || '');
  const genres = genresRaw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

  const shelfRaw = String(data.get('shelf_id') || '');
  const keywordsRaw = String(data.get('keywords') || '').trim();

  return {
    title: String(data.get('title') || '').trim(),
    author: String(data.get('author') || '').trim(),
    format: (String(data.get('format') || 'paperback') as BookFormat),
    is_digital: data.get('is_digital') === 'on',
    shelf_id: shelfRaw || null,
    genres,
    keywords: keywordsRaw || null,
  };
}

function focusPanel(): void {
  requestAnimationFrame(() => {
    const first = app.querySelector<HTMLElement>('.panel input, .panel select, .panel textarea');
    first?.focus();
  });
}

function render(): void {
  const shelfCounts = countByShelf(state.books);
  const filtered = visibleBooks();
  const recent = [...state.books]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const genreCount = uniqueGenres(state.books).length;

  app.innerHTML = `
    <div class="page">
      <header class="site-header">
        <div class="brand">
          <h1 class="brand-title">The Raconteur's Commonplace</h1>
          <p class="brand-kicker">Personal library / catalogue</p>
        </div>
        <div class="header-actions">
          <nav class="nav-links" aria-label="Primary">
            <a href="#catalogue">Catalogue</a>
            <a href="#room">Enter the full room</a>
          </nav>
          <button type="button" class="btn btn-primary" data-action="open-add-book">Add book</button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar">
          <p class="sidebar-label">Browse shelves</p>
          <ul class="shelf-list">
            <li class="shelf-item">
              <button
                type="button"
                class="linkish ${state.activeShelfId === null ? 'active' : ''}"
                data-action="filter-all"
              >All books</button>
              <span class="count">${state.books.length}</span>
            </li>
            ${state.shelves
              .map(
                (shelf) => `
              <li class="shelf-item">
                <button
                  type="button"
                  class="linkish ${state.activeShelfId === shelf.id ? 'active' : ''}"
                  data-action="filter-shelf"
                  data-id="${escapeAttr(shelf.id)}"
                >${escapeHtml(shelf.name)}</button>
                <span class="count">${shelfCounts.get(shelf.id) ?? 0}</span>
              </li>`
              )
              .join('')}
          </ul>
          <hr class="sidebar-divider" />
          <button type="button" class="linkish" data-action="open-add-shelf">Add a shelf</button>
        </aside>

        <main class="main" id="catalogue">
          ${state.status ? `<p class="status-line" role="status">${escapeHtml(state.status)}</p>` : ''}
          ${renderPanel()}

          <p class="section-kicker">Catalogue</p>
          <h2 class="hero-title">A life in books.</h2>
          <p class="hero-lead">A plain index of the stories, ideas, and places kept close.</p>
          <div class="stats">
            <span>${state.books.length} books</span>
            <span>${state.shelves.length} shelves</span>
            <span>${genreCount} genres</span>
          </div>
          <hr class="hero-rule" />

          <div class="tools">
            <label class="sr-only" for="query">Search</label>
            <input
              id="query"
              class="search-input"
              type="search"
              name="query"
              value="${escapeAttr(state.query)}"
              placeholder="Search title, author, or keyword"
              autocomplete="off"
            />
            <label class="sr-only" for="sort">Sort</label>
            <select id="sort" class="sort-select" name="sort">
              <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Recently added</option>
              <option value="title" ${state.sort === 'title' ? 'selected' : ''}>Title A–Z</option>
              <option value="author" ${state.sort === 'author' ? 'selected' : ''}>Author A–Z</option>
            </select>
          </div>

          ${
            state.activeShelfId === null && !state.query
              ? `
          <section class="list-section">
            <div class="section-head">
              <h3 class="section-title">Recently added</h3>
              <span class="section-meta">newest arrivals</span>
            </div>
            ${renderBookList(recent)}
          </section>`
              : ''
          }

          <section class="list-section" id="all-books">
            <div class="section-head">
              <h3 class="section-title">${activeShelfLabel()}</h3>
              <span class="section-meta">${filtered.length} title${filtered.length === 1 ? '' : 's'}</span>
            </div>
            ${
              state.loading
                ? '<p class="empty">Loading catalogue…</p>'
                : renderBookList(filtered)
            }
          </section>

          <section class="list-section" id="room" aria-label="The full room">
            <div class="section-head">
              <h3 class="section-title">The full room</h3>
              <span class="section-meta">coming later</span>
            </div>
            <p class="empty">A quieter reading room will open here in a later chapter.</p>
          </section>
        </main>
      </div>
    </div>
  `;

  // Screen-reader-only utility injected once via CSS class
  ensureSrOnlyStyle();
}

function renderPanel(): string {
  if (state.panel.kind === 'none') return '';

  if (state.panel.kind === 'add-shelf') {
    return `
      <section class="panel" aria-labelledby="panel-title">
        <h3 class="panel-title" id="panel-title">Add a shelf</h3>
        <form data-form="shelf">
          <div class="form-grid">
            <div class="field full">
              <label for="shelf-name">Shelf name</label>
              <input id="shelf-name" name="name" required maxlength="80" placeholder="e.g. Nightstand" />
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn">Save shelf</button>
            <button type="button" class="linkish" data-action="close-panel">Cancel</button>
          </div>
        </form>
      </section>
    `;
  }

  const editingId = state.panel.kind === 'edit-book' ? state.panel.bookId : null;
  const editing = editingId
    ? state.books.find((b) => b.id === editingId) ?? null
    : null;

  const title = editing ? 'Edit book' : 'Add book';
  const book = editing;

  return `
    <section class="panel" aria-labelledby="panel-title">
      <h3 class="panel-title" id="panel-title">${title}</h3>
      <form data-form="book">
        <input type="hidden" name="id" value="${escapeAttr(book?.id ?? '')}" />
        <div class="form-grid">
          <div class="field">
            <label for="book-title">Title</label>
            <input id="book-title" name="title" required maxlength="200" value="${escapeAttr(book?.title ?? '')}" />
          </div>
          <div class="field">
            <label for="book-author">Author</label>
            <input id="book-author" name="author" required maxlength="200" value="${escapeAttr(book?.author ?? '')}" />
          </div>
          <div class="field">
            <label for="book-format">Format</label>
            <select id="book-format" name="format">
              ${formatOptions(book?.format ?? 'paperback')}
            </select>
          </div>
          <div class="field">
            <label for="book-shelf">Shelf</label>
            <select id="book-shelf" name="shelf_id">
              <option value="">Unshelved</option>
              ${state.shelves
                .map(
                  (s) =>
                    `<option value="${escapeAttr(s.id)}" ${book?.shelf_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field full">
            <label for="book-genres">Genres</label>
            <input
              id="book-genres"
              name="genres"
              placeholder="Comma-separated, e.g. fantasy, literary fiction"
              value="${escapeAttr((book?.genres ?? []).join(', '))}"
            />
          </div>
          <div class="field full">
            <label for="book-keywords">Keywords</label>
            <input
              id="book-keywords"
              name="keywords"
              placeholder="Optional search words"
              value="${escapeAttr(book?.keywords ?? '')}"
            />
          </div>
          <div class="check-row">
            <input id="book-digital" name="is_digital" type="checkbox" ${book?.is_digital ? 'checked' : ''} />
            <label for="book-digital">Digital edition</label>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">${editing ? 'Save changes' : 'Save book'}</button>
          <button type="button" class="linkish" data-action="close-panel">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

function renderBookList(books: Book[]): string {
  if (!books.length) {
    return '<p class="empty">No titles match this view.</p>';
  }

  return `
    <ul class="book-list">
      ${books
        .map(
          (book) => `
        <li class="book-row">
          <a class="book-title" href="#book-${escapeAttr(book.id)}" id="book-${escapeAttr(book.id)}">${escapeHtml(book.title)}</a>
          <span class="book-author">${escapeHtml(book.author)}</span>
          <span class="book-meta">
            <span>${escapeHtml(formatLabel(book.format))}</span>
            ${book.is_digital ? '<span>Digital edition</span>' : ''}
          </span>
          <span class="book-actions">
            <button type="button" class="linkish" data-action="open-edit-book" data-id="${escapeAttr(book.id)}">Edit</button>
            <button type="button" class="linkish" data-action="delete-book" data-id="${escapeAttr(book.id)}">Delete</button>
          </span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function visibleBooks(): Book[] {
  const q = state.query.trim().toLowerCase();

  let list = state.books.filter((book) => {
    if (state.activeShelfId && book.shelf_id !== state.activeShelfId) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      book.title,
      book.author,
      book.keywords ?? '',
      book.genres.join(' '),
      book.format,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  list = [...list];
  if (state.sort === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.sort === 'author') {
    list.sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
  } else {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  return list;
}

function activeShelfLabel(): string {
  if (!state.activeShelfId) return 'All books';
  return state.shelves.find((s) => s.id === state.activeShelfId)?.name ?? 'Shelf';
}

function countByShelf(books: Book[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const book of books) {
    if (!book.shelf_id) continue;
    map.set(book.shelf_id, (map.get(book.shelf_id) ?? 0) + 1);
  }
  return map;
}

function uniqueGenres(books: Book[]): string[] {
  const set = new Set<string>();
  for (const book of books) {
    for (const genre of book.genres) set.add(genre.toLowerCase());
  }
  return [...set];
}

function formatLabel(format: BookFormat): string {
  switch (format) {
    case 'paperback':
      return 'Paperback';
    case 'hardcover':
      return 'Hardcover';
    case 'ebook':
      return 'Ebook';
    default:
      return 'Other';
  }
}

function formatOptions(selected: BookFormat): string {
  const options: BookFormat[] = ['paperback', 'hardcover', 'ebook', 'other'];
  return options
    .map(
      (value) =>
        `<option value="${value}" ${value === selected ? 'selected' : ''}>${formatLabel(value)}</option>`
    )
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong talking to Supabase.';
}

function ensureSrOnlyStyle(): void {
  if (document.getElementById('sr-only-style')) return;
  const style = document.createElement('style');
  style.id = 'sr-only-style';
  style.textContent = `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;
  document.head.appendChild(style);
}
