import Link from 'next/link';
import { browseListings } from '@/lib/server/listings';
import { serializeListingFeed } from '@/lib/server/listing-feed';
import { browseUrl, categories, categoryName } from '@/lib/marketplace';
import { SearchForm } from '@/components/search-form';
import { MarketplaceSidebar } from '@/components/marketplace-sidebar';
import { ListingFeed } from '@/components/listing-feed';
import { Button } from '@/components/ui/button';

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
  const listings = await browseListings(category, query, 1);
  const returnTo = browseUrl({ category, query });
  return (
    <main id="main-content" className="marketplace-main page-container">
      <MarketplaceSidebar category={category} query={query} />
      <section className="marketplace-results" aria-labelledby="browse-title">
        <div className="browse-toolbar">
          <div className="browse-title-row">
            <h1 id="browse-title">
              {query
                ? `Results for “${query}”`
                : category
                  ? categoryName(category)
                  : "Today's picks"}
            </h1>
            {(query || category) && (
              <Button variant="link" size="sm" asChild>
                <Link href="/">Clear filters</Link>
              </Button>
            )}
          </div>
          <SearchForm query={query} category={category} />
        </div>
        <ListingFeed
          key={returnTo}
          initialPage={serializeListingFeed(listings, 1)}
          category={category}
          query={query}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}
