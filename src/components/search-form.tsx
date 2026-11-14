export function SearchForm({ query, category }: { query: string; category: string }) {
  return (
    <form className="search-form" action="/" role="search">
      <label className="visually-hidden" htmlFor="marketplace-search">
        Search listings
      </label>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.7" />
        <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <input
        id="marketplace-search"
        name="q"
        placeholder="What are you looking for?"
        defaultValue={query}
        maxLength={100}
        type="search"
      />
      {category && <input type="hidden" name="category" value={category} />}
      <button type="submit">Search</button>
    </form>
  );
}
