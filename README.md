# Marketplace

A small no-login marketplace built for the CAPM Marketplace challenge. Visitors can publish an image listing, browse by category, search, open a direct listing URL, and save a private buyer inquiry.

## Run locally

Use Node.js 24 (`nvm use`), then:

```sh
npm ci
cp .env.example .env.local
```

Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `RATE_LIMIT_SALT`. The server accepts Supabase's current secret keys as well as legacy service-role keys. Keep these values private. `NEXT_PUBLIC_SITE_URL` is optional site metadata configuration. On Vercel, the production domain is detected automatically when that variable is absent.

Run `supabase/migrations/001_marketplace.sql` in a new Supabase project's SQL Editor. For an automatic setup, additionally configure the optional `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` locally, then run `npm run db:setup`. The migration targets a new project and should be applied once.

```sh
npm run dev
```

Use the address printed by Next.js. The development server can select another port when 3000 is already occupied.

## Design and structure

The interface uses Geist Sans, shadcn/ui React components, and a Facebook Marketplace-inspired layout: category filters on the left, search and listings on the right, and an inline seller-message form on each item page. Create listing opens a large, compact dialog with the photo and all listing fields visible together. The `/create` address opens the same dialog over the marketplace. Search stays sticky, and the feed loads 12 listings per batch as its end enters view. My listings remembers up to 1,000 listing identifiers in this browser; it is a local list of public items, not an authenticated account or ownership permission. Earlier listings created before browser tracking was added are not imported automatically.

- `src/app`: server-rendered routes and HTTP mutation handlers.
- `src/components`: focused browsing, creation, messaging, and layout components.
- `src/lib/marketplace.ts`: shared category definitions, display formatting, and browse URLs.
- `src/lib/validation.ts`: shared input contracts; the server validates independently.
- `src/lib/server`: server-only Supabase access, queries, request checks, and rate limiting.
- `supabase/migrations`: schema, constraints, indexes, permissions, and RPCs.
- `scripts`: database setup, optional sample data, and reproducible icon generation.
- `tests`: validation and real browser-to-Supabase verification.

Data reads remain on the server. Forms and the dialog are small client components. There is no authentication system, global state library, ORM wrapper, or parallel API abstraction.

## Data and access boundaries

Listings and product images are public. Buyer messages are private: anonymous and authenticated Data API roles have no message read or write grants. Mutation endpoints validate input and use a server-only secret key. That key bypasses RLS, so handler validation is part of the trust boundary.

The seller email intentionally appears on the detail page, with disclosure in the creation form. Message recipients are resolved from the stored listing, never from client-provided seller details. Messages are stored privately in Supabase and emailed through the configured SMTP provider. The buyer’s email is set as Reply-To. A delivery timestamp prevents successful retries from sending another notification; failed sends retain the saved message and offer an email retry. SMTP acceptance does not guarantee inbox delivery. A seller inbox is not part of this app.

Images are limited to 4 MB, decoded to verify their contents, bounded by pixel count, stripped of source metadata, resized when needed, and encoded as WebP. Original filenames never become Storage paths. The limit leaves room for multipart overhead on the hosting platform.

Client-generated UUIDs make listing and message retries idempotent. Postgres enforces uniqueness and foreign keys. A database-backed hourly counter limits writes using a salted address hash; it is an abuse guard, not an identity or ownership system. On Vercel, the application uses its trusted forwarded-address header, with a local-development fallback.

Failed database inserts trigger uploaded-image cleanup. An interrupted process can still leave an orphaned image: periodically compare bucket UUID prefixes with listing IDs and remove only confirmed unreferenced objects from an administrative context. No public delete endpoint exists.

## Optional demonstration records

```sh
npm run db:seed
```

This adds deterministic sample listings and copies their stock images into Supabase Storage. Every sample detail description explicitly identifies the content as a demonstration item not offered for sale. Sample contact addresses use a reserved example domain. Uploaded visitor listings are separate records.

Sample image sources are Unsplash image URLs listed in `scripts/seed.ts`; they are demonstration photography, not evidence of actual goods owned by a seller.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For browser checks, configure `SUPABASE_PUBLISHABLE_KEY` in `.env.local` for anonymous-permission assertions, then run `npm run test:e2e`. Playwright builds and starts its own production server on port 3002 with a local SMTP receiver on port 3025. Test mail stays local and accepts only `.test` recipients. These tests create controlled records, verify Storage, database persistence, SMTP delivery/retry, infinite loading, and My listings, and remove their own listings and messages afterward.

```sh
npm run test:e2e
```

The local browser configuration uses Google Chrome at its standard macOS application path. Change `launchOptions.executablePath` in `playwright.config.ts` for another platform or use an installed Playwright Chromium build.

## Deployment

Deploy this Next.js repository to Vercel with Node.js 24. Apply the migration and configure the three required server variables in the target environment. Do not give preview deployments production secrets by default. Confirm the production URL is public and rerun the create, browse, detail, and messaging flow there.

Live application: https://marketplace-pi-sage.vercel.app

Repository: https://github.com/2peng23/marketplace

## Screenshots and showreel

Submission screenshots and the separate 60-second showreel are delivered outside source control. All video, audio, capture, and render outputs are ignored by both Git and Vercel packaging. There is no embedded showreel or video dependency in the application.

The requested narration voice for the film is `T2sZgOl8ol4kf4u6yM2z`. Rendering sources and media delivery status are provided separately with the final artifacts.

### Gmail / SMTP setup

Run `npm run email:setup` and open `http://127.0.0.1:3004`. Enter a Gmail address and a Google app password in the masked field. The local form verifies SMTP authentication before writing `.env` with owner-only file permissions. It is a separate loopback-only helper and is never part of the deployed website. Passwords are never returned to the browser, logged, or committed. Use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_SECURE` in Vercel’s server environment for production. Port 465 uses TLS directly; port 587 requires STARTTLS.

Apply `supabase/migrations/002_email_delivery.sql` to an existing database before enabling email; it adds delivery and send-claim timestamps. This migration was applied to the connected development project. Completed deliveries are not retried. Failed attempts can retry; concurrent attempts use a two-minute database claim. As with SMTP generally, an ambiguous disconnect after server acceptance can cause a duplicate on retry. The email Message-ID remains stable across retries.
