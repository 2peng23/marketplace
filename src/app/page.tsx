import Link from 'next/link';
import { browseListings } from '@/lib/server/listings';
import { imageUrl } from '@/lib/server/supabase';
import { browseUrl, categories, categoryName, PAGE_SIZE } from '@/lib/marketplace';
import { ListingCard } from '@/components/listing-card';
import { SearchForm } from '@/components/search-form';

export const dynamic = 'force-dynamic';
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const query = typeof parameters.q === 'string' ? parameters.q.trim().slice(0, 100) : '';
  const category = categories.some((option) => option.slug === parameters.category)
    ? String(parameters.category)
    : '';
  const page = Math.min(
    1000,
    Math.max(1, Number.parseInt(String(parameters.page ?? '1'), 10) || 1),
  );
  const listings = await browseListings(category, query, page);
  const returnTo = browseUrl({ category, query, page });
  return (
    <main id="main-content" className="marketplace-main page-container">
      <section className="browse-heading">
        <div>
          <p className="eyebrow">A little less new. A lot more you.</p>
          <h1>Find your next good thing.</h1>
        </div>
        <SearchForm query={query} category={category} />
      </section>
      <nav className="category-navigation" aria-label="Filter listings by category">
        <Link
          className={`category-tab ${!category ? 'active' : ''}`}
          aria-current={!category ? 'page' : undefined}
          href={browseUrl({ query })}
        >
          All items
        </Link>
        {categories.map((option) => (
          <Link
            className={`category-tab ${category === option.slug ? 'active' : ''}`}
            aria-current={category === option.slug ? 'page' : undefined}
            href={browseUrl({ category: option.slug, query })}
            key={option.slug}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      <div className="results-heading">
        <div>
          <h2>
            {query ? `Results for “${query}”` : category ? categoryName(category) : 'Fresh finds'}
          </h2>
          <span className="result-count">
            {listings.count} {listings.count === 1 ? 'listing' : 'listings'}
          </span>
        </div>
        {category || query ? (
          <Link className="text-link" href="/">
            Clear filters
          </Link>
        ) : (
          <span className="sort-label">Newest first</span>
        )}
      </div>
      {listings.items.length ? (
        <div className="listing-grid">
          {listings.items.map((listing, index) => (
            <ListingCard
              listing={listing}
              image={imageUrl(listing.image_path)}
              returnTo={returnTo}
              priority={index < 4}
              key={listing.id}
            />
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <div className="empty-mark" aria-hidden="true">
            {query || category ? '…' : '↗'}
          </div>
          <h2>{query || category ? 'No finds this time.' : 'Make room for the first find.'}</h2>
          <p>
            {query || category
              ? 'Try another search or take a look at all items.'
              : 'List something you’re ready to pass on.'}
          </p>
          <Link className="button button-primary" href={query || category ? '/' : '/create'}>
            {query || category ? 'Browse all items' : 'Create a listing'}
          </Link>
        </section>
      )}
      {listings.count > PAGE_SIZE && (
        <nav className="pagination" aria-label="Listing pages">
          {page > 1 ? (
            <Link
              className="button button-secondary"
              href={browseUrl({ category, query, page: page - 1 })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {Math.max(1, Math.ceil(listings.count / PAGE_SIZE))}
          </span>
          {page * PAGE_SIZE < listings.count ? (
            <Link
              className="button button-secondary"
              href={browseUrl({ category, query, page: page + 1 })}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <section className="sell-note">
        <div>
          <span className="sell-note-label">A NEW CHAPTER</span>
          <h2>Someone’s next find could be yours.</h2>
          <p>A photo, a few details, and it’s out there.</p>
        </div>
        <Link className="button button-secondary" href="/create">
          List an item <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </main>
  );
}
