import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findListing } from '@/lib/server/listings';
import { imageUrl } from '@/lib/server/supabase';
import { categoryName, formatPrice } from '@/lib/marketplace';
import { MessageSeller } from '@/components/message-seller';

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
  const from =
    typeof parameters.from === 'string' && parameters.from.startsWith('/?') ? parameters.from : '/';
  return (
    <main id="main-content" className="page-container detail-main">
      <Link className="back-link" href={from}>
        <span aria-hidden="true">←</span> Back to browsing
      </Link>
      {parameters.created === '1' && (
        <p className="created-notice" role="status">
          Your listing is live. A new chapter starts here.
        </p>
      )}
      <div className="detail-layout">
        <div className="detail-photo">
          <Image
            src={imageUrl(listing.image_path)}
            alt={listing.title}
            fill
            priority
            sizes="(max-width: 800px) 100vw, 60vw"
          />
        </div>
        <section className="detail-summary">
          <Link className="detail-category" href={`/?category=${listing.category}`}>
            {categoryName(listing.category)}
          </Link>
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
          <div className="detail-description">
            <h2>About this item</h2>
            <p>{listing.description}</p>
          </div>
          <div className="seller-contact">
            <span className="seller-initial" aria-hidden="true">
              {listing.seller_email.charAt(0).toUpperCase()}
            </span>
            <div>
              <span>Seller contact</span>
              <a href={`mailto:${listing.seller_email}`}>{listing.seller_email}</a>
            </div>
          </div>
          <MessageSeller listingId={listing.id} title={listing.title} />
          <p className="contact-note">Ask a question or leave your contact details.</p>
        </section>
      </div>
      <div className="detail-bottom-note">
        <span>Found something you like?</span>
        <Link className="text-link" href="/">
          Keep exploring <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </main>
  );
}
