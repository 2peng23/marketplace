import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findListing } from '@/lib/server/listings';
import { imageUrl } from '@/lib/server/supabase';
import { browseReturnUrl, categoryName, formatPrice } from '@/lib/marketplace';
import { MessageSeller } from '@/components/message-seller';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';
type PageProperties = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: PageProperties) {
  const listing = await findListing((await params).id);
  return {
    title: listing?.title ?? 'Listing not found',
    description: listing?.description.slice(0, 160),
  };
}
export default async function ListingDetailPage({ params, searchParams }: PageProperties) {
  const listing = await findListing((await params).id);
  if (!listing) notFound();
  const parameters = await searchParams;
  const from = browseReturnUrl(parameters.from);
  return (
    <main id="main-content" className="page-container detail-main">
      <Button variant="link" asChild className="back-link">
        <Link href={from}>
          <ArrowLeft aria-hidden="true" />
          Back to Marketplace
        </Link>
      </Button>
      {parameters.created === '1' && (
        <Alert className="created-notice" role="status">
          <AlertDescription>Your listing is live.</AlertDescription>
        </Alert>
      )}
      <div className="detail-layout">
        <div className="detail-photo">
          <Image
            src={imageUrl(listing.image_path)}
            alt={listing.title}
            fill
            priority
            sizes="(max-width: 760px) 100vw, 65vw"
          />
        </div>
        <section className="detail-summary">
          <h1>{listing.title}</h1>
          <p className="detail-price">{formatPrice(listing.price)}</p>
          <p className="listed-date">
            Listed{' '}
            {new Intl.DateTimeFormat('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(listing.created_at))}
          </p>
          <p className="detail-category">
            Category:{' '}
            <Link href={`/?category=${listing.category}`}>{categoryName(listing.category)}</Link>
          </p>
          <div className="detail-description">
            <h2>Description</h2>
            <p>{listing.description}</p>
          </div>
          <div className="seller-contact">
            <div>
              <h2>Seller information</h2>
              <a href={`mailto:${listing.seller_email}`}>{listing.seller_email}</a>
            </div>
          </div>
          <Separator />
          <MessageSeller listingId={listing.id} title={listing.title} />
        </section>
      </div>
    </main>
  );
}
