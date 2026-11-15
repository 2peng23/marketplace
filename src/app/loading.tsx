import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main
      id="main-content"
      className="page-container loading-page"
      aria-busy="true"
      aria-label="Loading marketplace"
    >
      <Skeleton className="skeleton-heading" />
      <Skeleton className="skeleton-search" />
      <div className="listing-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <Skeleton className="skeleton-image" />
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line short" />
          </div>
        ))}
      </div>
      <span className="visually-hidden" role="status">
        Loading listings…
      </span>
    </main>
  );
}
