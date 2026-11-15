import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Header } from '@/components/brand';
import { ListingDialogProvider } from '@/components/create-listing-dialog';
import './globals.css';

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' });
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title: { default: 'Marketplace', template: '%s | Marketplace' },
  description: 'Browse items, create a listing, and message sellers. No account needed.',
  applicationName: 'Marketplace',
  icons: {
    icon: [
      { url: '/icon.svg?v=marketplace-blue-1', type: 'image/svg+xml' },
      { url: '/favicon.ico?v=marketplace-blue-1', sizes: '16x16 32x32 48x48' },
    ],
    apple: '/apple-touch-icon.png?v=marketplace-blue-1',
  },
  openGraph: {
    title: 'Marketplace',
    description: 'Browse items, create a listing, and message sellers.',
    type: 'website',
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable} data-scroll-behavior="smooth">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <ListingDialogProvider>
          <Header />
          {children}
        </ListingDialogProvider>
      </body>
    </html>
  );
}
