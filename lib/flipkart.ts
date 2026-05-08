import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ProductMeta, ReviewItem, ReviewSort, ReviewsResponse } from '@/lib/types';

const FLIPKART_ORIGIN = 'https://www.flipkart.com';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_USER_AGENT =
  process.env.FLIPKART_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type ProductContext = {
  normalizedUrl: URL;
  pid?: string;
  itemId: string;
  slugPath: string;
  reviewPageBase: string;
};

type ReviewCandidate = Record<string, unknown>;

class FlipkartRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlipkartRateLimitError';
  }
}

const supportedServerSorts: ReviewSort[] = ['MOST_RECENT', 'MOST_HELPFUL', 'POSITIVE_FIRST', 'NEGATIVE_FIRST'];

export function parseFlipkartProductUrl(rawUrl: string): ProductContext {
  const normalizedUrl = normalizeFlipkartUrl(rawUrl);
  const hostname = normalizedUrl.hostname.replace(/^www\./, '');

  if (!hostname.endsWith('flipkart.com')) {
    throw new Error('Only Flipkart product URLs are supported.');
  }

  const itemId = normalizedUrl.pathname.match(/\/p\/([^/?#]+)/i)?.[1];
  if (!itemId) {
    throw new Error('Could not find the Flipkart product identifier in the URL.');
  }

  const slugPath = normalizedUrl.pathname.split('/p/')[0].replace(/\/+$/, '');
  const pid = normalizedUrl.searchParams.get('pid') ?? undefined;
  const reviewPageBase = `${FLIPKART_ORIGIN}${slugPath}/product-reviews/${itemId}`;

  return { normalizedUrl, pid, itemId, slugPath, reviewPageBase };
}

export async function fetchFlipkartReviews(productUrl: string, page: number, sort: ReviewSort): Promise<ReviewsResponse> {
  const context = await resolveProductContext(productUrl);
  const reviewPageUrl = buildReviewPageUrl(context, page, sort);
  const html = await fetchHtml(reviewPageUrl);

  const product = parseProductMeta(html, context, reviewPageUrl);
  const allReviews = extractReviews(html, reviewPageUrl);
  const reviews = sortReviews(allReviews, sort);

  return {
    product,
    reviews,
    page,
    hasMore: hasMoreReviews(html, reviews.length),
    sort,
    totalParsed: reviews.length,
  };
}

async function resolveProductContext(rawUrl: string) {
  const normalizedInput = normalizeFlipkartUrl(rawUrl);

  if (looksLikeShortFlipkartUrl(normalizedInput)) {
    throw new Error('Please enter the full Flipkart product URL, not a short link.');
  }

  return parseFlipkartProductUrl(normalizedInput.toString());
}

function normalizeFlipkartUrl(rawUrl: string) {
  return new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
}

function looksLikeShortFlipkartUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, '');
  return hostname === 'dl.flipkart.com' || /^\/s\//i.test(url.pathname);
}

function buildReviewPageUrl(context: ProductContext, page: number, sort: ReviewSort) {
  const reviewUrl = new URL(context.reviewPageBase);

  if (context.pid) {
    reviewUrl.searchParams.set('pid', context.pid);
  }

  reviewUrl.searchParams.set('page', String(page));
  reviewUrl.searchParams.set('sortOrder', supportedServerSorts.includes(sort) ? sort : 'MOST_RECENT');

  return reviewUrl.toString();
}

function getRequestHeaders(referer?: string) {
  return {
    'user-agent': DEFAULT_USER_AGENT,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-IN,en;q=0.9',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    ...(referer ? { 'referer': referer } : {}),
  };
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: getRequestHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status === 529) {
      throw new FlipkartRateLimitError('Flipkart is rate limiting this request. Please try again in a few moments.');
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Flipkart is blocking this request. Try a different product URL.');
      }
      throw new Error(`Flipkart responded with ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (isAbortError(error)) {
      throw new FlipkartRateLimitError('Flipkart is rate limiting this request. Please try again in a few moments.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getTimeoutMs() {
  const configuredTimeout = Number(process.env.FLIPKART_FETCH_TIMEOUT_MS);

  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  return DEFAULT_TIMEOUT_MS;
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
}

function parseProductMeta(html: string, context: ProductContext, reviewPageUrl: string): ProductMeta {
  const $ = cheerio.load(html);
  const title = readMeta($, ['og:title', 'twitter:title']) || $('h1').first().text().trim() || 'Flipkart product';
  const image = readMeta($, ['og:image', 'twitter:image']) || undefined;
  const description = readMeta($, ['og:description', 'description']) || '';
  const rating = extractNumber(description) ?? extractNumber($('body').text()) ?? undefined;
  const reviewCount = extractReviewCount(description) ?? extractReviewCount($('body').text()) ?? undefined;

  return {
    title,
    image,
    rating,
    reviewCount,
    reviewPageUrl,
    pid: context.pid,
    itemId: context.itemId,
  };
}

function extractReviews(html: string, reviewPageUrl: string): ReviewItem[] {
  const embeddedObjects = extractEmbeddedObjects(html);
  const candidates = collectReviewCandidates(embeddedObjects);
  const reviews = candidates
    .map((candidate) => normalizeReview(candidate, html, reviewPageUrl))
    .filter(isReviewItem);

  if (reviews.length > 0) {
    return dedupeReviews(reviews);
  }

  return extractReviewsFromMarkup(html, reviewPageUrl);
}

function extractReviewsFromMarkup(html: string, reviewPageUrl: string): ReviewItem[] {
  const $ = cheerio.load(html);
  const cards = $('div, article, li')
    .toArray()
    .map((element) => $(element));

  const reviews = cards
    .map((node) => {
      const text = node.text().replace(/\s+/g, ' ').trim();
      const title = node.find('h3, h4').first().text().trim();
      const reviewer = node.find('[data-testid*="reviewer"], ._2sc7ZR, .X43Kjb').first().text().trim();
      const rating = extractNumber(node.attr('aria-label') ?? text) ?? extractNumber(text) ?? 0;
      const reviewUrl = extractReviewUrlFromNode(node.html() ?? '', reviewPageUrl);

      if (!title && !reviewer && !rating && text.length < 40) {
        return null;
      }

      const review: ReviewItem = {
        id: hashString(`${reviewer}-${title}-${text}`),
        reviewerName: reviewer || 'Verified buyer',
        rating,
        title: title || 'Review',
        text,
        dateLabel: '',
        verifiedBuyer: /verified/i.test(text),
        helpfulCount: extractHelpfulCount(text),
        variant: undefined,
        images: extractImages(node.html() ?? ''),
        reviewUrl: reviewUrl ?? undefined,
        reviewPageUrl,
      };

      return review;
    })
    .filter(isReviewItem);

  return dedupeReviews(reviews).slice(0, 20);
}

function collectReviewCandidates(value: unknown, accumulator: ReviewCandidate[] = []): ReviewCandidate[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReviewCandidates(item, accumulator));
    return accumulator;
  }

  if (isPlainObject(value)) {
    if (looksLikeReview(value)) {
      accumulator.push(value);
    }

    for (const nestedValue of Object.values(value)) {
      collectReviewCandidates(nestedValue, accumulator);
    }
  }

  return accumulator;
}

function isReviewItem(review: ReviewItem | null): review is ReviewItem {
  return review !== null;
}

function normalizeReview(candidate: ReviewCandidate, html: string, reviewPageUrl: string): ReviewItem | null {
  const rating = readNumber(candidate, ['rating', 'stars', 'starRating', 'score']);
  const title = readString(candidate, ['title', 'reviewTitle', 'headline', 'summary']) || '';
  const text = readString(candidate, ['reviewText', 'text', 'body', 'content', 'reviewBody', 'review']) || '';
  const reviewerName = readString(candidate, ['reviewerName', 'author', 'name', 'userName', 'displayName']) || 'Flipkart user';
  const dateLabel = readString(candidate, ['date', 'reviewDate', 'createdAt', 'updatedAt', 'timestamp']) || '';
  const dateValue = parseDateValue(dateLabel);
  const verifiedBuyer = readBoolean(candidate, ['verifiedBuyer', 'verified', 'isCertifiedBuyer', 'certifiedBuyer']);
  const helpfulCount =
    readNumber(candidate, ['helpfulCount', 'helpfulVotes', 'likes', 'upvotes']) ?? extractHelpfulCount(`${title} ${text} ${dateLabel}`);
  const variant = readString(candidate, ['variant', 'variantName', 'size', 'color', 'sku']);
  const images = extractImagesFromCandidate(candidate);
  const reviewId = readString(candidate, ['reviewId', 'id', 'reviewID', 'commentId']);
  const reviewUrl =
    extractUrl(candidate) ??
    (reviewId ? extractReviewUrlFromHtml(html, reviewId) : null) ??
    (reviewId ? extractReviewUrlFromText(html, reviewId) : null) ??
    undefined;

  if (!rating && !text && !title) {
    return null;
  }

  return {
    id: reviewId || hashString(`${reviewerName}-${title}-${text}-${dateLabel}`),
    reviewerName,
    rating: rating ?? 0,
    title: title || 'Review',
    text,
    dateLabel,
    dateValue,
    verifiedBuyer,
    helpfulCount,
    variant: variant || undefined,
    images,
    reviewUrl,
    reviewPageUrl,
  };
}

function sortReviews(reviews: ReviewItem[], sort: ReviewSort) {
  const sorted = [...reviews];

  sorted.sort((left, right) => {
    switch (sort) {
      case 'MOST_HELPFUL':
        return right.helpfulCount - left.helpfulCount || (right.dateValue ?? 0) - (left.dateValue ?? 0);
      case 'POSITIVE_FIRST':
        return right.rating - left.rating || (right.dateValue ?? 0) - (left.dateValue ?? 0);
      case 'NEGATIVE_FIRST':
        return left.rating - right.rating || (right.dateValue ?? 0) - (left.dateValue ?? 0);
      case 'HIGHEST_RATING':
        return right.rating - left.rating || right.helpfulCount - left.helpfulCount;
      case 'LOWEST_RATING':
        return left.rating - right.rating || right.helpfulCount - left.helpfulCount;
      case 'MOST_RECENT':
      default:
        return (right.dateValue ?? 0) - (left.dateValue ?? 0) || right.helpfulCount - left.helpfulCount;
    }
  });

  return sorted;
}

function hasMoreReviews(html: string, reviewCount: number) {
  const $ = cheerio.load(html);
  const nextLink = $('a[rel="next"], a[href*="page="]').toArray().some((element) => {
    const href = $(element).attr('href');
    return Boolean(href && /page=(\d+)/i.test(href));
  });

  return nextLink || reviewCount >= 10;
}

function extractEmbeddedObjects(html: string): unknown[] {
  const scripts = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1]);
  const objects: unknown[] = [];

  for (const script of scripts) {
    const parsed = tryParseStructuredData(script);
    if (parsed) {
      objects.push(parsed);
    }
  }

  return objects;
}

function tryParseStructuredData(script: string): unknown | null {
  const trimmed = script.trim();
  const candidates = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?$/,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?})\s*;?$/,
    /window\.__INITIAL_DATA__\s*=\s*({[\s\S]*?})\s*;?$/,
    /__NEXT_DATA__\s*=\s*({[\s\S]*?})\s*;?$/,
  ];

  for (const pattern of candidates) {
    const match = trimmed.match(pattern);
    if (match) {
      return safeJsonParse(match[1]);
    }
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return safeJsonParse(trimmed);
  }

  const jsonSnippet = extractLikelyJsonSnippet(trimmed);
  return jsonSnippet ? safeJsonParse(jsonSnippet) : null;
}

function extractLikelyJsonSnippet(input: string) {
  const startIndex = input.indexOf('{');
  const endIndex = input.lastIndexOf('}');

  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  const snippet = input.slice(startIndex, endIndex + 1);
  return snippet.includes('review') ? snippet : null;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function looksLikeReview(value: ReviewCandidate) {
  const keys = Object.keys(value).map((entry) => entry.toLowerCase());
  return (
    keys.some((entry) => ['reviewtext', 'reviewbody', 'reviewtitle', 'title', 'rating', 'reviewername', 'helpfulcount', 'reviewid'].includes(entry)) &&
    (keys.some((entry) => ['reviewtext', 'reviewbody', 'content', 'text'].includes(entry)) || keys.some((entry) => ['rating'].includes(entry)))
  );
}

function readString(value: ReviewCandidate | Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim();
    }
  }

  return null;
}

function readNumber(value: ReviewCandidate | Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      return entry;
    }
    if (typeof entry === 'string') {
      const parsed = extractNumber(entry);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function readBoolean(value: ReviewCandidate | Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'boolean') {
      return entry;
    }
    if (typeof entry === 'string') {
      if (/^(true|yes|verified|certified)$/i.test(entry)) {
        return true;
      }
      if (/^(false|no)$/i.test(entry)) {
        return false;
      }
    }
  }

  return false;
}

function extractUrl(value: ReviewCandidate) {
  for (const key of ['reviewUrl', 'shareUrl', 'permalink', 'url', 'href', 'link']) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.includes('flipkart.com')) {
      const normalized = normalizeFlipkartReviewUrl(entry);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function extractReviewUrlFromHtml(html: string, reviewId: string) {
  const escaped = escapeRegExp(reviewId);
  const patterns = [
    new RegExp(`https://www\\.flipkart\\.com[^"'\\s>]*${escaped}[^"'\\s>]*`, 'i'),
    new RegExp(`https://www\\.flipkart\\.com[^"'\\s>]*[?&]reviewId=${escaped}[^"'\\s>]*`, 'i'),
    new RegExp(`[^"'\\s>]*[?&]reviewId=${escaped}[^"'\\s>]*`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern)?.[0];
    if (!match) {
      continue;
    }

    const candidate = match.startsWith('http') ? match : `${FLIPKART_ORIGIN}${match.startsWith('/') ? '' : '/'}${match}`;
    const normalized = normalizeFlipkartReviewUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractReviewUrlFromText(html: string, reviewId: string) {
  const match = html.match(new RegExp(`https://www\\.flipkart\\.com[^"'\\s>]*reviewId=${escapeRegExp(reviewId)}[^"'\\s>]*`, 'i'))?.[0];
  return match ? normalizeFlipkartReviewUrl(match) : null;
}

function extractReviewUrlFromNode(html: string, reviewPageUrl: string) {
  const match = html.match(/https:\/\/www\.flipkart\.com[^"'\s>]+review[^"'\s>]*/i)?.[0];
  if (!match) {
    return null;
  }

  const normalized = normalizeFlipkartReviewUrl(match);
  return normalized;
}

function normalizeFlipkartReviewUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, FLIPKART_ORIGIN);
    const hostname = url.hostname.replace(/^www\./, '');

    if (!hostname.endsWith('flipkart.com')) {
      return null;
    }

    if (url.searchParams.has('reviewId')) {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function extractImagesFromCandidate(candidate: ReviewCandidate) {
  const urls: string[] = [];

  for (const key of ['images', 'imageUrls', 'image', 'reviewImages', 'media']) {
    const entry = candidate[key];

    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') {
          urls.push(item);
        } else if (isPlainObject(item)) {
          const nested = readString(item, ['url', 'src', 'image', 'imageUrl', 'thumbnail']) ?? null;
          if (nested) {
            urls.push(nested);
          }
        }
      }
    } else if (typeof entry === 'string') {
      urls.push(entry);
    }
  }

  return normalizeUrls(urls);
}

function extractImages(html: string) {
  const urls = Array.from(html.matchAll(/https:\/\/rukminim\d?\.flixcart\.com[^"'\s>]+/gi)).map((match) => match[0]);
  return normalizeUrls(urls);
}

function normalizeUrls(urls: string[]) {
  return Array.from(
    new Set(
      urls
        .map((value) => value.replace(/[\"'\s>]+$/g, ''))
        .filter((value) => /https:\/\/(?:rukminim\d?\.flixcart\.com|www\.flipkart\.com)/i.test(value)),
    ),
  );
}

function dedupeReviews(reviews: ReviewItem[]) {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key = review.reviewUrl || review.id;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractNumber(input: string | undefined | null) {
  if (!input) {
    return null;
  }

  const match = input.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1]);
}

function extractReviewCount(input: string) {
  const match = input.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s+Reviews?/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractHelpfulCount(input: string) {
  const match = input.replace(/,/g, '').match(/(\d+)\s+(?:people\s+)?found\s+this\s+helpful/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseDateValue(input: string) {
  if (!input) {
    return undefined;
  }

  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function hashString(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

function readMeta($: cheerio.CheerioAPI, names: string[]) {
  for (const name of names) {
    const content = $(`meta[property="${name}"], meta[name="${name}"]`).attr('content');
    if (content?.trim()) {
      return content.trim();
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
