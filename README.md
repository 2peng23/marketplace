# Marketplace

A marketplace built with Next.js, React, Supabase, and shadcn/ui. Browsing, posting, messaging, and sandbox checkout need no account. Sellers enter their listing email to configure Stripe payments; no login or email code is needed.

## Run locally

Use Node.js 24, then:

```sh
npm ci
cp .env.example .env.local
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `RATE_LIMIT_SALT`. Keep credentials out of source control. Apply the SQL migrations in order to a new Supabase project, then start the app:

```sh
npm run dev
```

The optional `npm run db:setup` command applies all migrations through the Supabase Management API when `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are configured. Use it once for a new database. For an existing database, pass only unapplied filenames, for example `npm run db:setup -- 002_email_delivery.sql`. Existing migrations are retained as schema history.

## Architecture

| Location                            | Responsibility                                                             |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `src/app`                           | Server-rendered pages and thin HTTP handlers.                              |
| `src/components`                    | Product UI and the shadcn primitives used by it.                           |
| `src/hooks/use-listing-feed.ts`     | Infinite loading, request cancellation, retries, and observer lifetime.    |
| `src/lib/marketplace.ts`            | Shared categories, limits, display formatting, and browse URLs.            |
| `src/lib/validation.ts`             | Input and response schemas shared by the browser and server.               |
| `src/lib/api.ts`                    | Typed browser requests and readable API errors.                            |
| `src/lib/server/http.ts`            | Bounded body parsing, origin checks, validation, and HTTP error responses. |
| `src/lib/server/publish-listing.ts` | Listing persistence and uploaded-image cleanup.                            |
| `src/lib/server/images.ts`          | Image validation, resizing, metadata removal, and WebP encoding.           |
| `src/lib/server/messages.ts`        | Private message persistence and idempotent request checks.                 |
| `src/lib/server/email.ts`           | Delivery claims, completed-send receipts, and retry behavior.              |
| `src/lib/server/smtp.ts`            | SMTP configuration and seller email composition.                           |
| `src/lib/server/listings.ts`        | Listing reads; request-scoped caching avoids duplicate detail queries.     |
| `src/lib/server/database.types.ts`  | Database contract corresponding to the SQL migrations.                     |
| `supabase/migrations`               | Tables, constraints, permissions, indexes, and database functions.         |
| `scripts`                           | Local setup, optional demonstration data, and icon generation.             |
| `tests`                             | Contract, HTTP, storage, and browser regression checks.                    |

The app uses local component state and one dialog context. Sellers are identified by their listing email without an app login. Database, SMTP, and Stripe modules remain server-only.

Payment code has four focused responsibilities: `seller-context.ts` remembers the email-selected seller in a signed cookie, `seller-payments.ts` manages connected accounts, `checkout.ts` coordinates orders and reservations, and `stripe-events.ts` verifies and commits provider events. `payments.ts` holds shared contracts and exact money calculations.

## Stripe Connect sandbox

This extends Test 3 with seller onboarding, one-item Stripe Checkout, a 10% platform fee, webhook-confirmed orders, and Sold listings. Use the supplied sandbox; live keys and live events are rejected.

1. Apply `003_stripe_connect.sql` after the earlier migrations. It adds private sellers, orders, and webhook receipts, along with transactional reservation and confirmation functions. Existing data is retained. Apply `20261115120948_email_based_sellers.sql` afterward to enable email-only seller setup and automatic listing matching.
2. Run `npm run stripe:setup` to enter the supplied secret in a loopback-only masked form. It verifies test mode and saves `.env.local` with owner-only permissions. Set the supplied `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` there too; hosted redirects currently do not need a browser Stripe SDK.
3. Set `APP_URL` to the canonical public HTTPS origin. Set the Stripe variables and existing SMTP/Supabase variables in Vercel, then deploy the webhook route.
4. Run `npm run stripe:webhook` locally. This creates a **Connect** endpoint at `/api/stripe/webhook` and saves its signing secret and endpoint ID in `.env.local` without printing the secret. Copy `STRIPE_WEBHOOK_SECRET` securely into Vercel and redeploy. Checkout stays disabled until a signing secret is configured.

The endpoint listens for Checkout completion/expiration and `account.updated`. It ignores other candidates' accounts and orders in the shared sandbox. The script reuses its recorded endpoint on subsequent runs and does not delete shared endpoints. If the sandbox has reached its endpoint limit, ask the test owner to free a slot or provide a separate sandbox; leave checkout disabled until registration succeeds. A Stripe CLI listener has its own temporary signing secret. Remove it after any controlled verification run; the deployed app needs its permanent endpoint's signing secret.

The integration uses Stripe SDK 23.1.0, Accounts v2, hosted onboarding, and **direct charges on the seller's connected account**. The supplied platform requires Stripe-managed risk. Express account creation uses Stripe's documented `2026-10-28.preview` version for that combination; other requests use stable API `2026-10-28.endive`. This preview dependency is isolated to account creation. Stripe collects processing fees separately from our 10% application fee. There is no promise of an immediate bank payout. The Connect snapshot endpoint also receives v1-compatible account updates from v2 accounts; readiness is retrieved through the v2 merchant card-payments capability.

Seller identity follows the hiring brief: entering an email selects that seller without login, an OTP, or proof of email ownership. A signed, HttpOnly cookie remembers the selection for one hour. Existing and future listings with the normalized email match automatically through service-only database functions and an insert trigger, including concurrent listing/setup requests. Seller IDs and connected accounts are preserved when migrating from the earlier verified-email flow. This email-only identity model is intentional for the test environment; real-money use would require verified identity and authorization. Live Stripe keys and live webhook events are rejected.

Prices remain USD. Database reservations snapshot integer cents and round a half-cent platform fee upward. Free listings, prices under $0.50, and amounts exceeding Stripe's supported eight-digit cent range remain contact-only. Hosted Checkout is restricted to cards.

Only one creating, pending, or paid order can exist per listing. Reservations and sale confirmation lock the listing in Postgres. Stripe creation retries reuse a stable idempotency key and the original price snapshot. Checkout expires after one hour. Cancellation first expires the payable Stripe session; a cancellation redirect alone does not release inventory. Interrupted creation is reconciled against this app's connected account before a stale reservation is released. Uncertain outcomes remain reserved until recovery can establish their state.

The webhook requires the original body and a valid signature, checks the connected-account scope, amount, currency, application fee, and payment status, then records the event, confirms the order, and marks Sold in one transaction. Duplicate or late expiration events cannot undo a paid order. The confirmation page waits for this database state and is accessible only to the originating buyer browser through an HttpOnly capability cookie.

Test the deployed flow with the email on a seller’s listing, supported Stripe test identity/bank details, and card `4242 4242 4242 4242` with a future expiry and test CVC. Also check a declined card and an authentication challenge. Confirm the application fee on the connected charge, the private Supabase order, and Sold state. The app does not add shipping, taxes, subscriptions, or a refund dashboard.

## Behavior and data boundaries

- Search remains sticky. The feed starts with 12 items and fetches another batch as its end enters view; the Load more control also supports keyboard use.
- My listings stores up to 1,000 public listing identifiers in the current browser. It is not an account or proof of ownership. Clearing browser storage removes this local list, and earlier listings are not imported automatically.
- Listings, their images, and seller contact emails are public. The create form explains that email visibility. Buyer messages are private and have no anonymous or authenticated database read/write grants.
- HTTP handlers validate inputs independently. Request limits apply to received bytes, including bodies without a trustworthy Content-Length. Image files are limited to 4 MB, decoded with a pixel limit, stripped of metadata, and encoded as WebP.
- A listing retry reuses the original result only when its metadata matches. Forms generate a new request ID when the listing or photo changes. Message retries similarly reject a request ID reused for different content.
- Message recipients come from the saved listing. The buyer address is Reply-To, never the authenticated SMTP sender. Email failures retain the message and offer a retry.
- Completed email deliveries are not sent again on retry. A two-minute database claim coordinates concurrent attempts. SMTP acceptance is not proof of inbox delivery; an ambiguous disconnect or failed receipt write can still cause a duplicate on retry. Message-ID remains stable.
- Rate limits use an hourly database counter keyed by a salted address hash. They are an abuse guard, not an identity system.
- Failed listing inserts remove only an upload that is confirmed unreferenced. A process interruption or unavailable database can leave an orphaned image; administrative cleanup must verify the object is unreferenced before deleting it.

## Email setup

For Gmail, run:

```sh
npm run email:setup
```

Open `http://127.0.0.1:3004` and enter the Gmail address and Google app password in its masked field. The loopback-only helper verifies authentication before saving the project’s ignored `.env` file with owner-only permissions. It does not send a test email or become part of the deployed website. Its HTML is separate from credential handling.

For deployment, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_SECURE` as server environment variables. Port 465 uses TLS directly; remote SMTP providers on other ports require STARTTLS. Passwords and provider responses are not logged. The local test mail receiver uses loopback and accepts only `.test` recipients.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:payments:database
npm run test:e2e
```

The browser suite builds the production app, starts it on port 3002, and uses a local SMTP receiver on port 3025. Configure Supabase credentials and `SUPABASE_PUBLISHABLE_KEY` in `.env.local`. The suite creates identifiable disposable records, verifies persistence and permission boundaries, and removes its records and images afterward. It does not send external email. Use a dedicated test database when available.

The local Playwright configuration uses Google Chrome at its standard macOS path. Adjust `launchOptions.executablePath` for another platform. Unit tests run with React’s server condition so server-only HTTP helpers can be tested directly.

The opt-in payment database check exercises simultaneous reservations, automatic email matching, duplicate confirmations, transaction rollback, late expiry, and anonymous access against Postgres. It creates and removes identifiable temporary records; use a dedicated test project when available. Browser checks exercise email-only seller setup, automatic listing matching, private cookies, and rejection of account/amount tampering. Provider-hosted onboarding and real sandbox Checkout require a separate end-to-end walkthrough.

`npm run build` also runs independently when only production compilation is needed. To add labeled demonstration listings, run `npm run db:seed`; stock image URLs are recorded in `scripts/seed.ts`. To regenerate the favicon and Apple touch icon from `public/icon.svg`, run `node scripts/generate-icons.mjs`.

## Deployment and local video

Deploy to Vercel with Node.js 24 after applying the migrations and configuring server variables. Keep production secrets out of previews unless that access is intentional.

- Live app: [marketplace-pi-sage.vercel.app](https://marketplace-pi-sage.vercel.app)
- Repository: [2peng23/marketplace](https://github.com/2peng23/marketplace)

The generated reel, captions, poster, QA notes, and editable Remotion source are in `Marketplace Video/`. The entire folder is excluded from Git, Vercel uploads, linting, formatting, and TypeScript. Submission screenshots remain in the ignored `artifacts/` folder. No video dependency is included in the application.
