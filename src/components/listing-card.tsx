import Image from 'next/image';
import Link from 'next/link';
import { categoryName, formatPrice, type Listing } from '@/lib/marketplace';
import { Card } from '@/components/ui/card';

export function ListingCard({
  listing,
  image,
  returnTo,
  priority = false,
}: {
  listing: Listing;
  image: string;
  returnTo?: string;
  priority?: boolean;
}) {
  const destination = `/listings/${listing.id}${returnTo && returnTo !== '/' ? `?from=${encodeURIComponent(returnTo)}` : ''}`;
  return (
    <Card className="listing-card">
      <Link href={destination} className="listing-card-link">
        <div className="listing-image">
          {listing.sale_status === 'sold' && <span className="listing-sale-badge">Sold</span>}
          <Image
            src={image}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw"
            priority={priority}
          />
        </div>
        <div className="listing-card-content">
          <div className="listing-price">{formatPrice(listing.price)}</div>
          <h3>{listing.title}</h3>
          <p>{categoryName(listing.category)}</p>
        </div>
      </Link>
    </Card>
  );
}
