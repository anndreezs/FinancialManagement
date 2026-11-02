import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'success' | 'danger';
  className?: string;
  action?: ReactNode;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
  className,
  action,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30',
        variant === 'success' && 'hover:border-success/30',
        variant === 'danger' && 'hover:border-destructive/30',
        className
      )}
    >
      {/* Glow */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          variant === 'default' && 'bg-gradient-to-br from-primary/5 to-transparent',
          variant === 'success' && 'bg-gradient-to-br from-success/5 to-transparent',
          variant === 'danger' && 'bg-gradient-to-br from-destructive/5 to-transparent'
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {action}
          </div>

          <p className="text-2xl font-bold tracking-tight text-foreground">
            {value}
          </p>

          {trend && (
            <p
              className={cn(
                'flex items-center text-xs font-medium',
                trend.isPositive ? 'text-success' : 'text-destructive'
              )}
            >
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span className="ml-1">{Math.abs(trend.value)}% este mês</span>
            </p>
          )}
        </div>

        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
            variant === 'default' && 'bg-primary/10 text-primary',
            variant === 'success' && 'bg-success/10 text-success',
            variant === 'danger' && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}
