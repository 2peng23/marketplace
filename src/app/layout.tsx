import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Header, Footer } from '@/components/brand';
import './globals.css';

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' });
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title: { default: 'Marketplace — Find your next good thing', template: '%s | Marketplace' },
  description:
    'A simple place to discover pre-loved finds, list something worth sharing, and connect with sellers. No account needed.',
  applicationName: 'Marketplace',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Marketplace',
    description: 'Good things deserve another chapter.',
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
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
