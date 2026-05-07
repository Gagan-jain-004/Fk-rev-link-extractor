import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'glass';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
        variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
        variant === 'outline' && 'border-border bg-transparent text-foreground',
        variant === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        variant === 'glass' && 'border-white/10 bg-white/10 text-foreground backdrop-blur-xl dark:bg-white/5',
        className,
      )}
      {...props}
    />
  );
}
