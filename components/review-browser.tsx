'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Flame,
  Link2,
  Loader2,
  ScanSearch,
  Search,
  ShieldCheck,
  X,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ReviewCard } from '@/components/review-card';
import { ReviewSkeleton } from '@/components/review-skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import type { ProductMeta, ReviewItem, ReviewSort } from '@/lib/types';
import { cn } from '@/lib/utils';

type ToastState = {
  id: string;
  message: string;
  kind: 'success' | 'error';
};

type BrowserResponse = {
  product: ProductMeta;
  reviews: ReviewItem[];
  page: number;
  hasMore: boolean;
  sort: ReviewSort;
  totalParsed: number;
  warning?: string;
};

const sortOptions: Array<{ value: ReviewSort; label: string; icon: ReactNode }> = [
  { value: 'MOST_RECENT', label: 'Most Recent', icon: <ArrowDownWideNarrow className="h-4 w-4" /> },
  { value: 'POSITIVE_FIRST', label: 'Positive First', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'NEGATIVE_FIRST', label: 'Negative First', icon: <TrendingDown className="h-4 w-4" /> },
  { value: 'MOST_HELPFUL', label: 'Most Helpful', icon: <Flame className="h-4 w-4" /> },
  { value: 'HIGHEST_RATING', label: 'Highest Rating', icon: <ArrowUpNarrowWide className="h-4 w-4" /> },
  { value: 'LOWEST_RATING', label: 'Lowest Rating', icon: <ArrowDownAZ className="h-4 w-4" /> },
];

export function ReviewBrowser() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [product, setProduct] = useState<ProductMeta | null>(null);
  const [pages, setPages] = useState<BrowserResponse[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<ReviewSort>('MOST_RECENT');
  const [search, setSearch] = useState('');
  const [reviewCountLimit, setReviewCountLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [copiedReviewId, setCopiedReviewId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const debounceSearch = useDebounce(search, 220);
  const activeRequestId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadedReviews = useMemo(() => pages.flatMap((entry) => entry.reviews), [pages]);
  const filteredReviews = useMemo(() => {
    const query = debounceSearch.trim().toLowerCase();

    return loadedReviews
      .filter((review) => {
        if (!query) {
          return true;
        }

        const haystack = [review.reviewerName, review.title, review.text, review.variant, review.dateLabel].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
        .sort((left, right) => compareReviews(left, right, sort));
      }, [debounceSearch, loadedReviews, sort]);

  const uniqueReviews = useMemo(() => {
    const seen = new Set<string>();

    return filteredReviews.filter((review) => {
      const key = review.reviewUrl || review.id;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [filteredReviews]);

  const visibleReviews = uniqueReviews.slice(0, reviewCountLimit);
  const needsMoreReviews = reviewCountLimit > uniqueReviews.length && hasMore;
  const reviewCountBadgeLabel = loadingMore && needsMoreReviews
    ? `Loading ${visibleReviews.length} of ${reviewCountLimit} visible`
    : `${visibleReviews.length} of ${uniqueReviews.length} visible`;

  async function handleLoadReviews(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading) {
      return;
    }

    const trimmed = sourceUrl.trim();

    if (!trimmed) {
      setError('Paste a Flipkart product URL first.');
      return;
    }

    setError(null);
    setLoading(true);
    setLoadingMore(false);
    setCopiedReviewId(null);
    setPages([]);
    setProduct(null);
    setActiveUrl('');
    setHasMore(false);

    activeRequestId.current += 1;
    const requestId = activeRequestId.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/reviews?url=${encodeURIComponent(trimmed)}&page=1&sort=${sort}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as BrowserResponse & { error?: string };

      if (requestId !== activeRequestId.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to read Flipkart reviews.');
      }

      startTransition(() => {
        setActiveUrl(trimmed);
        setProduct(payload.product);
        setPages([payload]);
        setPage(2);
        setHasMore(payload.hasMore);
      });

      if (payload.warning) {
        pushToast(payload.warning, 'error');
      }
    } catch (loadError) {
      if (requestId !== activeRequestId.current) {
        return;
      }

      if (loadError instanceof Error && loadError.name === 'AbortError') {
        return;
      }

      const message = loadError instanceof Error ? loadError.message : 'Unable to read Flipkart reviews.';
      setError(message);
      pushToast(message, 'error');
    } finally {
      if (requestId === activeRequestId.current) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  async function loadMoreReviews() {
    if (!activeUrl || !hasMore || loadingMore || loading) {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await fetch(`/api/reviews?url=${encodeURIComponent(activeUrl)}&page=${page}&sort=${sort}`);
      const payload = (await response.json()) as BrowserResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load more reviews.');
      }

      startTransition(() => {
        setPages((currentPages) => [...currentPages, payload]);
        setPage((current) => current + 1);
        setHasMore(payload.hasMore);
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load more reviews.';
      setError(message);
      pushToast(message, 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  function handleCopyReviewLink(review: ReviewItem) {
    if (!review.reviewUrl) {
      pushToast('This review does not expose a permalink in Flipkart data.', 'error');
      return;
    }

    void navigator.clipboard.writeText(review.reviewUrl).then(() => {
      setCopiedReviewId(review.id);
      pushToast('Flipkart review link copied successfully', 'success');
      window.setTimeout(() => {
        setCopiedReviewId((current) => (current === review.id ? null : current));
      }, 1400);
    });
  }

  function pushToast(message: string, kind: ToastState['kind']) {
    const id = Math.random().toString(36).slice(2);
    setToast({ id, message, kind });
    window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 2400);
  }

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.pageYOffset > 240);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!activeUrl || loading || loadingMore) {
      return;
    }

    if (loadedReviews.length < reviewCountLimit && hasMore) {
      void loadMoreReviews();
    }
  }, [activeUrl, hasMore, loadedReviews.length, loading, loadingMore, reviewCountLimit]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 pb-14 pt-3 sm:gap-6 sm:px-6 lg:px-8">
      <div className="glass noise relative overflow-hidden rounded-[1.5rem] border border-white/10 p-4 shadow-glow sm:rounded-[2rem] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.32))] dark:bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.14),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.5),rgba(15,23,42,0.18))]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="max-w-2xl space-y-2 pr-2">
            <div className="flex flex-wrap gap-2">
              <BadgePill icon={<ScanSearch className="h-3.5 w-3.5" />} label="Live review fetch" />
              <BadgePill icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Mobile friendly" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-pretty text-2xl font-semibold tracking-tight sm:text-4xl">
                <span className="text-gradient">Flipkart Review Lens</span>
              </h1>
              <p className="max-w-xl text-sm leading-5 text-muted-foreground sm:text-base sm:leading-6">
                Search Flipkart reviews fast, filter the noise, and copy real review links.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>

        <form onSubmit={handleLoadReviews} className="relative mt-4 grid gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Paste a Flipkart product URL, for example https://www.flipkart.com/.../p/..."
              disabled={loading}
              className="h-12 rounded-xl border-white/10 bg-white/70 pl-11 pr-11 text-sm shadow-lg placeholder:text-muted-foreground/70 sm:h-14 sm:rounded-2xl sm:text-base dark:bg-slate-950/40"
            />
            {sourceUrl ? (
              <button
                type="button"
                onClick={() => setSourceUrl('')}
                disabled={loading}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground disabled:opacity-50 dark:hover:bg-white/10"
                aria-label="Clear URL"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button type="submit" size="lg" disabled={loading} className="h-12 rounded-xl px-5 text-sm sm:h-14 sm:rounded-2xl sm:px-6 sm:text-base">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            {loading ? 'Loading reviews' : 'Fetch reviews'}
          </Button>
        </form>

        {loading ? (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <AnimatePresence mode="wait">
              <motion.div
                key="loading-strip"
                className="h-full w-1/3 rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.95),rgba(34,197,94,0.95))]"
                initial={{ x: '-120%' }}
                animate={{ x: ['-120%', '220%'] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
              />
            </AnimatePresence>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-900 dark:text-red-400 font-medium">{error}</p> : null}
        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{loadedReviews.length > 0 ? 'Refreshing reviews...' : 'Searching Flipkart reviews...'}</span>
            <span className="hidden sm:inline">This will appear as soon as Flipkart responds.</span>
          </div>
        ) : null}
      </div>

      {loading && pages.length === 0 ? <LoadingState /> : null}

      {loading && pages.length > 0 ? <RefreshOverlay message={loadedReviews.length > 0 ? 'Refreshing reviews...' : 'Searching Flipkart reviews...'} /> : null}

      {product ? (
        <div className="sticky top-3 z-20">
          <Card className="surface-outline border-white/10 bg-gradient-to-br from-white/50 to-white/30 px-3 py-4 shadow-lg backdrop-blur-xl sm:px-5 sm:py-5 dark:from-white/5 dark:to-white/5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <BadgePill
                icon={loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                label={reviewCountBadgeLabel}
              />
            </div>
            <div className="grid gap-2 sm:gap-3 xl:grid-cols-[1.1fr_0.8fr_auto] xl:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search reviews for battery, camera, heating, delivery..."
                  className="h-10 rounded-xl border-white/10 bg-background/80 pl-11 pr-11 text-sm shadow-sm transition-all placeholder:text-muted-foreground/60 focus:border-emerald-500/40 focus:ring-emerald-500/20 sm:h-11"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                <div className="relative">
                  <Select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as ReviewSort)}
                    className="h-10 rounded-xl border-white/10 bg-background/80 pr-9 text-sm shadow-sm transition-all focus:border-emerald-500/40 sm:h-11"
                    aria-label="Sort reviews"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>

                <div className="relative">
                  <Select
                    value={String(reviewCountLimit)}
                    onChange={(event) => setReviewCountLimit(Number(event.target.value))}
                    className="h-10 rounded-xl border-white/10 bg-background/80 text-sm shadow-sm transition-all focus:border-emerald-500/40 sm:h-11"
                    aria-label="Show review count"
                  >
                    <option value="10">Show 10</option>
                    <option value="20">Show 20</option>
                    <option value="50">Show 50</option>
                    <option value="100">Show 100</option>
                  </Select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>

                
              </div>

            </div>
          </Card>
        </div>
      ) : null}

      {product ? (
        <div className="space-y-3 sm:space-y-4">
          <AnimatePresence mode="popLayout">
            {visibleReviews.length > 0 ? (
              visibleReviews.map((review, index) => (
                <ReviewCard key={review.reviewUrl || review.id} review={review} index={index} copied={copiedReviewId === review.id} onCopy={handleCopyReviewLink} />
              ))
            ) : (
              <EmptyState search={search} />
            )}
          </AnimatePresence>

          {loadingMore ? <LoadingMoreState /> : null}

          {hasMore && !loadingMore ? (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="lg" onClick={() => void loadMoreReviews()} className="rounded-2xl">
                Load more from Flipkart
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {toast ? (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              className={cn(
                'fixed top-6 right-6 z-50 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl',
                toast.kind === 'success'
                  ? 'border-emerald-500/20 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-50'
                  : 'border-red-500/20 bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-50',
              )}
            >
              {toast.message}
            </motion.div>
          ) : null}
      </AnimatePresence>

        {showScrollTop ? (
          <button
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 sm:gap-4">
      <Card className="surface-outline border-white/10 bg-card/70 p-5 backdrop-blur-xl dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fetching reviews</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Preparing your review workspace</h2>
          </div>
          <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-600 dark:text-sky-400">
            Live request
          </div>
        </div>
      </Card>
      {Array.from({ length: 2 }).map((_, index) => (
        <ReviewSkeleton key={index} />
      ))}
    </div>
  );
}

function RefreshOverlay({ message }: { message: string }) {
  return (
    <Card className="surface-outline border-white/10 bg-card/70 px-4 py-4 backdrop-blur-xl dark:bg-card/60">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="text-xs text-muted-foreground">Keeping the current screen visible while new results load.</p>
        </div>
      </div>
    </Card>
  );
}

function LoadingMoreState() {
  return (
    <div className="surface-outline flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-card/70 py-4 text-sm text-muted-foreground backdrop-blur-xl dark:bg-card/60">
      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
      Loading more reviews...
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <Card className="surface-outline border-dashed border-white/15 bg-card/70 p-10 text-center backdrop-blur-xl dark:bg-card/60">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-white/10 to-emerald-500/10 p-4">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">No reviews match this view</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {search.trim() ? 'Try a different keyword or relax one of the filters.' : 'Load a Flipkart product URL to start browsing reviews.'}
        </p>
      </div>
    </Card>
  );
}

function BadgePill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/50 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-xl dark:bg-white/5">
      {icon}
      {label}
    </span>
  );
}

function compareReviews(left: ReviewItem, right: ReviewItem, sort: ReviewSort) {
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
}
