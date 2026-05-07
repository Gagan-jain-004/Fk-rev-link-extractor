import { NextRequest, NextResponse } from 'next/server';
import { fetchFlipkartReviews } from '@/lib/flipkart';
import type { ReviewSort } from '@/lib/types';

export const runtime = 'nodejs';

const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const ttlMs = 60_000;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const page = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1;
  const sort = normalizeSort(request.nextUrl.searchParams.get('sort'));

  if (!url) {
    return NextResponse.json({ error: 'A Flipkart product URL is required.' }, { status: 400 });
  }

  const cacheKey = `${url}|${page}|${sort}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  try {
    const payload = await fetchFlipkartReviews(url, page, sort);

    cache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      payload,
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      return NextResponse.json({ error: 'Flipkart took too long to respond. Please try again.' }, { status: 504 });
    }

    const message = error instanceof Error ? error.message : 'Unable to load Flipkart reviews.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeSort(value: string | null): ReviewSort {
  switch (value) {
    case 'MOST_HELPFUL':
    case 'POSITIVE_FIRST':
    case 'NEGATIVE_FIRST':
    case 'HIGHEST_RATING':
    case 'LOWEST_RATING':
      return value;
    case 'MOST_RECENT':
    default:
      return 'MOST_RECENT';
  }
}
