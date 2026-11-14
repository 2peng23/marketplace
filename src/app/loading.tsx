export default function Loading() {
  return (
    <main
      id="main-content"
      className="page-container loading-page"
      aria-busy="true"
      aria-label="Loading marketplace"
    >
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-tabs" />
      <div className="listing-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <div className="skeleton skeleton-image" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ))}
      </div>
      <span className="visually-hidden" role="status">
        Loading listings…
      </span>
    </main>
  );
}
