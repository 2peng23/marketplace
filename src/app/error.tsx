'use client';
export default function MarketplaceError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="page-container">
      <section className="empty-state error-state">
        <p className="eyebrow">A small interruption</p>
        <h1>We couldn’t load the marketplace.</h1>
        <p>Please try again. Your browser settings and filters are still here.</p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
