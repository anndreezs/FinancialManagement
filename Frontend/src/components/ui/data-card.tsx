import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DataCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DataCard({ title, action, children, className }: DataCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card',
        className
      )}
    >
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center">
        <h3 className="min-w-0 text-base font-semibold text-foreground">{title}</h3>
        {action && <div className="w-full min-w-0 sm:w-auto">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}
