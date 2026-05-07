# Flipkart Review Lens

A fast, no-database Next.js 15 app for browsing Flipkart reviews, filtering them instantly, and copying the original Flipkart review URL only when Flipkart exposes that permalink in the source page.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- ShadCN-style UI components
- Framer Motion
- Node.js route handlers

## What it does

- Accepts any Flipkart product URL.
- Fetches the product review page server-side.
- Extracts product metadata and review cards.
- Supports instant client-side search and filters.
- Loads more reviews progressively without a database.
- Copies the original Flipkart review URL when the source markup exposes one.

## Important note about review links

This app does not fabricate review permalinks. The copy/open actions only use a review URL when it can be extracted from Flipkart response data or markup. If Flipkart does not expose a permalink for a review, the app keeps that link disabled instead of generating a fake one.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Run the app.

```bash
npm run dev
```

3. Open `http://localhost:3000`.

## Environment variables

Optional:

- `FLIPKART_USER_AGENT` - custom request user-agent for review page fetches.
- `FLIPKART_FETCH_TIMEOUT_MS` - request timeout in milliseconds. Default: `12000`.

## Deployment on Vercel

1. Push the repository to GitHub.
2. Import it into Vercel.
3. Leave environment variables empty unless you want to override the request headers or timeout.
4. Deploy.

## Notes

- There is no database.
- Review search and filters are client-side for speed.
- Review fetching is paginated and cached briefly in memory on the server.
