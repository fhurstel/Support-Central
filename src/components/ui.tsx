import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Category, ReceiptStatus } from '../types';
import { CATEGORY_CHIP } from '../constants';

// Shared primitives: Button, CategoryChip, StatusBadge, Skeleton.

type ButtonVariant = 'primary' | 'ghost' | 'danger-link';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  const base =
    'rounded-[10px] text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand hover:bg-brand-dark text-white px-5 py-2.5',
    ghost: 'bg-white text-ink-2 border border-border hover:bg-canvas px-5 py-2.5',
    'danger-link': 'bg-transparent text-[#B4232A] font-medium hover:underline px-2 py-2.5',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function CategoryChip({ category }: { category: Category }) {
  const c = CATEGORY_CHIP[category];
  return (
    <span
      className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full inline-block whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {category}
    </span>
  );
}

const STATUS_META: Record<
  ReceiptStatus,
  { label: string; wrap: string; dot: string; pulse?: boolean }
> = {
  processing: {
    label: 'Processing',
    wrap: 'bg-[#EDF1F0] text-ink-2',
    dot: 'bg-ink-3',
    pulse: true,
  },
  needs_review: {
    label: 'Needs review',
    wrap: 'bg-amber-soft text-amber',
    dot: 'bg-amber',
  },
  confirmed: {
    label: 'Confirmed',
    wrap: 'bg-success-soft text-success',
    dot: 'bg-success',
  },
};

export function StatusBadge({ status }: { status: ReceiptStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap ${m.wrap}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${m.pulse ? 'animate-pulse' : ''}`} />
      {m.label}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#EAEEED] rounded ${className}`} />;
}

export function SourceIcon({ source }: { source: 'upload' | 'email' }) {
  return (
    <span className="text-ink-3" title={source === 'email' ? 'From email' : 'Uploaded'}>
      {source === 'email' ? '✉' : '⬆'}
    </span>
  );
}
