'use client';
import { Button } from '@/components/ui/button';
export default function MarketplaceError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="page-container">
      <section className="empty-state error-state">
        <h1>We couldn’t load the marketplace.</h1>
        <p>Please try again. Your browser settings and filters are still here.</p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
