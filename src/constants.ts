import type { Category } from './types';

export const CATEGORIES: Category[] = [
  'Meals',
  'Travel',
  'Office Supplies',
  'Software',
  'Utilities',
  'Other',
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'];

// Stable soft pastel chip colors per the design doc (§6).
// teal Meals, sky Travel, violet Software, amber Office Supplies, slate Utilities, gray Other.
export const CATEGORY_CHIP: Record<Category, { bg: string; text: string }> = {
  Meals: { bg: '#E6F3F2', text: '#0B5D57' },
  Travel: { bg: '#E3F0FA', text: '#1D5B8F' },
  Software: { bg: '#EFE9FA', text: '#5B3FA6' },
  'Office Supplies': { bg: '#FEF3E2', text: '#96580B' },
  Utilities: { bg: '#EAEEF2', text: '#44545E' },
  Other: { bg: '#EEF1F0', text: '#5B6B69' },
};

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
};

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
