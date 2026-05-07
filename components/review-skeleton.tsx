import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ReviewSkeleton() {
  return (
    <Card className="overflow-hidden border-white/10 bg-card/70 backdrop-blur-xl dark:bg-card/60">
      <div className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-4 w-52 rounded-full" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-11/12 rounded-full" />
          <Skeleton className="h-4 w-3/4 rounded-full" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="aspect-square rounded-2xl" />
        </div>
      </div>
    </Card>
  );
}
