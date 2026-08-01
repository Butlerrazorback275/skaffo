import React from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export const fade = {
  initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
  transition: { duration: 0.2 },
};
export const slideUp = {
  initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};
export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={clsx(
        'card-sheen rounded-xl border border-line bg-card/60 backdrop-blur-xl shadow-glass',
        hover && 'transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-card/85 hover:shadow-lg',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-[-0.01em] transition-all duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 whitespace-nowrap';
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };
  const variants = {
    primary: 'bg-primary text-white hover:bg-hover shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30',
    ghost:   'text-muted hover:text-txt hover:bg-raise',
    outline: 'border border-line text-txt hover:border-primary/60 hover:bg-primary/10 hover:text-txt',
    danger:  'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
    success: 'bg-success/15 text-success border border-success/30 hover:bg-success/25',
  };
  return <button className={clsx(base, sizes[size], variants[variant], className)} {...rest}>{children}</button>;
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-10 w-full rounded-lg border border-line bg-well px-3 text-sm text-txt placeholder:text-muted/50',
        'outline-none transition-all duration-200 hover:border-line',
        'focus:border-primary focus:bg-well focus:ring-4 focus:ring-primary/15',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'h-10 w-full cursor-pointer rounded-lg border border-line bg-well px-3 text-sm text-txt',
        'outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-primary/15',
        className,
      )}
      {...rest}
    >{children}</select>
  );
}

export function Badge({ children, tone = 'default', className }: {
  children: React.ReactNode; tone?: 'default' | 'primary' | 'success' | 'danger' | 'warn'; className?: string;
}) {
  const tones = {
    default: 'bg-raise text-muted border-line',
    primary: 'bg-primary/15 text-indigo-300 border-primary/30',
    success: 'bg-success/15 text-emerald-300 border-success/30',
    danger:  'bg-danger/15 text-red-300 border-danger/30',
    warn:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-primary' : 'bg-line')}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md', on ? 'left-[22px]' : 'left-0.5')}
      />
    </button>
  );
}

export function Empty({ icon, title, hint, action }: {
  icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <motion.div {...slideUp} className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-line bg-raise text-muted">{icon}</div>
      <div>
        <p className="text-[15px] font-semibold text-txt">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </motion.div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {right}
    </div>
  );
}

export const timeAgo = (iso: string | null) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};
