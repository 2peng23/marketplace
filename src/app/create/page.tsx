import MarketplacePage from '@/app/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create listing' };

export default function CreateListingPage() {
  return <MarketplacePage searchParams={Promise.resolve({})} />;
}
