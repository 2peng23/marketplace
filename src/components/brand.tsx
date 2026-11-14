import Link from 'next/link';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="currentColor" />
      <path
        d="M10 27V14.5a2.5 2.5 0 0 1 2.5-2.5H18v15h-8Zm12 0V12h5.5a2.5 2.5 0 0 1 2.5 2.5V27h-8Z"
        fill="white"
      />
      <path
        d="m16 17 4 4 4-4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Marketplace home">
      <BrandMark />
      <span>
        marketplace<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link className="browse-link" href="/">
            Browse
          </Link>
          <Link className="button button-primary header-create" href="/create">
            Create listing
          </Link>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <span>Good things deserve another chapter.</span>
      <span>
        Marketplace <span aria-hidden="true">·</span> Made for a second look
      </span>
    </footer>
  );
}
