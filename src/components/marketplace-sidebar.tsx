import Link from 'next/link';
import { browseUrl, categories } from '@/lib/marketplace';
import { CreateListingTrigger } from '@/components/create-listing-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function MarketplaceSidebar({
  category = '',
  query = '',
  ownListings = false,
}: {
  category?: string;
  query?: string;
  ownListings?: boolean;
}) {
  const selectedCategory = ownListings ? null : category || 'all';

  return (
    <aside className="marketplace-sidebar" aria-label="Marketplace filters">
      <Card className="sidebar-panel">
        <div className="sidebar-heading">
          <h2>Marketplace</h2>
          <CreateListingTrigger className="sidebar-create" />
        </div>
        <nav className="marketplace-navigation" aria-label="Marketplace navigation">
          <Button variant="ghost" asChild className="sidebar-nav-link my-listings-link">
            <Link href="/my-listings" aria-current={ownListings ? 'page' : undefined}>
              My listings
            </Link>
          </Button>
        </nav>
        <Separator />
        <nav className="category-navigation" aria-label="Filter listings by category">
          <h2 className="sidebar-title">Categories</h2>
          <Button variant="ghost" asChild className="sidebar-nav-link category-tab">
            <Link
              aria-current={selectedCategory === 'all' ? 'page' : undefined}
              href={browseUrl({ query })}
            >
              All items
            </Link>
          </Button>
          {categories.map((option) => (
            <Button
              variant="ghost"
              asChild
              key={option.slug}
              className="sidebar-nav-link category-tab"
            >
              <Link
                aria-current={selectedCategory === option.slug ? 'page' : undefined}
                href={browseUrl({ category: option.slug, query })}
              >
                {option.label}
              </Link>
            </Button>
          ))}
        </nav>
      </Card>
    </aside>
  );
}
