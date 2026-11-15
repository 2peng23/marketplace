import Link from 'next/link';
import { Store } from 'lucide-react';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Marketplace home">
      <span className="brand-mark">
        <Store size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <span>Marketplace</span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
      </div>
    </header>
  );
}
