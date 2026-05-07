'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { CheckCircle2, Copy, ExternalLink, ImageIcon, Sparkles, Star } from 'lucide-react';
import type { ReviewItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ReviewCardProps = {
  review: ReviewItem;
  index: number;
  copied: boolean;
  onCopy: (review: ReviewItem) => void;
};

export function ReviewCard({ review, index, copied, onCopy }: ReviewCardProps) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
    >
      <Card className="surface-outline group overflow-hidden border border-white/10 bg-card/80 transition-all duration-300 hover:-translate-y-1 hover:border-sky-500/20 hover:shadow-[0_28px_100px_rgba(15,23,42,0.18)] dark:bg-card/70">
        <div className="h-1.5 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" />
        <div className="flex flex-col gap-4 p-4 sm:p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground sm:text-base">{review.reviewerName}</p>
                {review.verifiedBuyer ? (
                  <Badge variant="success" className="gap-1.5 shadow-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified buyer
                  </Badge>
                ) : null}
                {review.variant ? <Badge variant="glass" className="shadow-sm">{review.variant}</Badge> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 font-medium text-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {review.rating.toFixed(1)}
                </span>
                <span className="hidden sm:inline">•</span>
                <span>{review.dateLabel || 'Flipkart review'}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopy(review)}
                disabled={!review.reviewUrl}
                className={cn(
                  'min-w-[138px] border-white/10 bg-background/70 transition-all hover:bg-emerald-500/10 active:scale-95 sm:min-w-[148px]',
                  copied && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}
              >
                {copied ? <Sparkles className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Link copied' : review.reviewUrl ? 'Copy Review Link' : 'Link unavailable'}
              </Button>

              {review.reviewUrl ? (
                <a
                  href={review.reviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: 'glass', size: 'sm' }),
                    'min-w-[138px] border-white/10 bg-white/10 shadow-sm transition-all hover:bg-white/20 sm:min-w-[148px]',
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Review
                </a>
              ) : (
                <span className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'min-w-[138px] opacity-50 sm:min-w-[148px]')}>
                  <ExternalLink className="h-4 w-4" />
                  Open Review
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-gradient-to-br from-white/45 to-white/20 p-4 dark:from-white/5 dark:to-transparent">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{review.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-[15px]">{review.text || 'No review text was exposed by the Flipkart page.'}</p>
                </div>

                {review.images.length > 0 ? (
                  <Badge variant="glass" className="gap-1.5 whitespace-nowrap border-white/10 shadow-sm">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {review.images.length} image{review.images.length > 1 ? 's' : ''}
                  </Badge>
                ) : null}
              </div>
            </div>

            {review.images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {review.images.slice(0, 5).map((image, imageIndex) => (
                  <div key={`${review.id}-${imageIndex}`} className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-secondary/40 shadow-sm transition-transform duration-300 hover:-translate-y-0.5">
                    <Image src={image} alt={`${review.reviewerName} review image ${imageIndex + 1}`} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" sizes="(max-width: 768px) 25vw, 12vw" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          
        </div>
      </Card>
    </motion.article>
  );
}
