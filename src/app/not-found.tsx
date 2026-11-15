import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function NotFound() {
  return (
    <main id="main-content" className="page-container">
      <section className="empty-state">
        <p>404</p>
        <h1>Listing not found</h1>
        <p>The listing may no longer be available, or the address isn’t quite right.</p>
        <Button asChild>
          <Link href="/">Back to the marketplace</Link>
        </Button>
      </section>
    </main>
  );
}
