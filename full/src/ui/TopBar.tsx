interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenSearch: () => void;
  onAddBook: () => void;
  onResetCamera: () => void;
}

const KOBO_HREF = import.meta.env.BASE_URL.includes('/full')
  ? '../'
  : '/The-Raconteur-s-Commonplace/';

export function TopBar({
  query,
  onQueryChange,
  onOpenSearch,
  onAddBook,
  onResetCamera,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <p className="brand-mark">The Raconteur&apos;s Commonplace</p>
        <p className="brand-sub">Home library</p>
      </div>

      <div className="topbar-tools">
        <label className="search-field">
          <span className="sr-only">Search library</span>
          <input
            type="search"
            placeholder="Search the library…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onOpenSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpenSearch();
            }}
          />
        </label>
        <button type="button" className="btn text" onClick={onOpenSearch}>
          Browse
        </button>
        <button type="button" className="btn text" onClick={onResetCamera}>
          Recenter
        </button>
        <button type="button" className="btn solid" onClick={onAddBook}>
          Add book
        </button>
        <a className="btn text quiet" href={KOBO_HREF}>
          Kobo
        </a>
      </div>
    </header>
  );
}
