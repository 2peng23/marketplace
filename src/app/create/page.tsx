import Link from 'next/link';
import { CreateListingForm } from '@/components/create-listing-form';
export const metadata = { title: 'Create a listing' };
export default function CreateListingPage() {
  return (
    <main id="main-content" className="page-container create-main">
      <Link href="/" className="back-link">
        <span aria-hidden="true">←</span> Back to browsing
      </Link>
      <div className="create-heading">
        <p className="eyebrow">MAKE ROOM FOR SOMETHING NEW</p>
        <h1>Pass a good thing on.</h1>
        <p>A photo, a few details, and your item is ready for its next chapter.</p>
      </div>
      <CreateListingForm />
    </main>
  );
}
