import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="page-container">
      <section className="empty-state">
        <p className="eyebrow">404 · Nothing here</p>
        <h1>This find has wandered off.</h1>
        <p>The listing may no longer be available, or the address isn’t quite right.</p>
        <Link className="button button-primary" href="/">
          Back to the marketplace
        </Link>
      </section>
    </main>
  );
}
