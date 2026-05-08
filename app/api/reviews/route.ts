import { NextRequest, NextResponse } from 'next/server';
import { fetchFlipkartReviews } from '@/lib/flipkart';
import { redisGet, redisSet, getRedis } from '@/lib/redis';
import type { ReviewSort } from '@/lib/types';

export const runtime = 'nodejs';

const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const DEFAULT_TTL_MS = 60_000;
const ttlMs = Number(process.env.REVIEWS_CACHE_TTL_MS) || DEFAULT_TTL_MS;

// In-memory per-host cooldown to avoid repeated hits after a 429
const hostCooldowns = new Map<string, number>();
const HOST_COOLDOWN_MS = Number(process.env.HOST_COOLDOWN_MS) || 60_000;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const page = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1;
  const sort = normalizeSort(request.nextUrl.searchParams.get('sort'));

  if (!url) {
    return NextResponse.json({ error: 'A Flipkart product URL is required.' }, { status: 400 });
  }

  const cacheKey = `${url}|${page}|${sort}`;
  const cached = cache.get(cacheKey);

  // Prefer Redis-backed cache when available
  try {
    const redis = getRedis();
    if (redis) {
      const raw = await redisGet(`cache:${cacheKey}`);
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          return NextResponse.json(payload, {
            headers: {
              'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
            },
          });
        } catch {}
      }
    }
  } catch {}

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  // Quick host cooldown check: if we recently saw a 429 for this host, avoid making another request
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    // prefer redis cooldown when available
    try {
      const redis = getRedis();
      if (redis) {
        const raw = await redisGet(`cooldown:${hostname}`);
        if (raw) {
          const expiry = Number(raw);
          if (expiry > Date.now()) {
            return NextResponse.json({ error: 'This Flipkart host is temporarily rate limited. Try again later.' }, { status: 429 });
          }
        }
      }
    } catch {}

    const cooldown = hostCooldowns.get(hostname) ?? 0;
    if (cooldown > Date.now()) {
      return NextResponse.json({ error: 'This Flipkart host is temporarily rate limited. Try again later.' }, { status: 429 });
    }
  } catch {
    // ignore parse errors and let downstream validation handle them
  }

  try {
    const payload = await fetchFlipkartReviews(url, page, sort);

    cache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      payload,
    });

    // persist to redis if available
    try {
      const redis = getRedis();
      if (redis) {
        await redisSet(`cache:${cacheKey}`, JSON.stringify(payload), ttlMs);
      }
    } catch (e) {}

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'FlipkartRateLimitError' || /rate limit/i.test(error.message))) {
      // set a short cooldown for this host to protect against repeated 429s
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace(/^www\./, '');
        const expiresAt = Date.now() + HOST_COOLDOWN_MS;
        hostCooldowns.set(hostname, expiresAt);
        try {
          const redis = getRedis();
          if (redis) {
            await redisSet(`cooldown:${hostname}`, String(expiresAt), HOST_COOLDOWN_MS);
          }
        } catch {}
      } catch {}

      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error instanceof Error && (error.name === 'FlipkartRequestTimeoutError' || /took too long/i.test(error.message))) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }

    const message = error instanceof Error ? error.message : 'Unable to load Flipkart reviews.';
    console.error('[API /reviews] Error fetching reviews:', { url, page, sort, error: message });

    const res = NextResponse.json({ error: message }, { status: 500 });
    try {
      if (process.env.NODE_ENV !== 'production') {
        res.headers.set('X-Upstream-Error', message);
      }
    } catch {}

    return res;
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
