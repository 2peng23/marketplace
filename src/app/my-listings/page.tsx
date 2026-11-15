import { MarketplaceSidebar } from '@/components/marketplace-sidebar';
import { SearchForm } from '@/components/search-form';
import { MyListingsFeed } from '@/components/listing-feed';

export const metadata = { title: 'My listings' };
export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const query = typeof parameters.q === 'string' ? parameters.q.trim().slice(0, 100) : '';
  return (
    <main id="main-content" className="marketplace-main page-container">
      <MarketplaceSidebar ownListings />
      <section className="marketplace-results" aria-labelledby="browse-title">
        <div className="browse-toolbar">
          <div className="browse-title-row">
            <h1 id="browse-title">My listings</h1>
          </div>
          <SearchForm query={query} category="" action="/my-listings" />
        </div>
        <MyListingsFeed query={query} />
      </section>
    </main>
  );
}
