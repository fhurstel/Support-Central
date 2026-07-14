import type { Category, ExtractedFields } from '../types';

// Mock AI extraction: takes a File, waits 1–2 s to make the "Extracting…" state
// visible, and returns plausible randomized fields. The interface
// (`extractReceipt(file): Promise<ExtractedFields>`) matches the future real
// endpoint so swapping in a real API is a one-file change.

type SampleVendor = {
  vendor: string;
  category: Category;
  min: number;
  max: number;
  taxRate: number | null;
};

const SAMPLE_VENDORS: SampleVendor[] = [
  { vendor: 'Starbucks', category: 'Meals', min: 4, max: 28, taxRate: 0.08 },
  { vendor: 'Sweetgreen', category: 'Meals', min: 12, max: 34, taxRate: 0.08 },
  { vendor: 'United Airlines', category: 'Travel', min: 120, max: 680, taxRate: 0.06 },
  { vendor: 'Marriott', category: 'Travel', min: 140, max: 420, taxRate: 0.12 },
  { vendor: 'Lyft', category: 'Travel', min: 8, max: 55, taxRate: null },
  { vendor: 'Best Buy', category: 'Office Supplies', min: 25, max: 320, taxRate: 0.085 },
  { vendor: 'Staples', category: 'Office Supplies', min: 12, max: 140, taxRate: 0.085 },
  { vendor: 'GitHub', category: 'Software', min: 4, max: 84, taxRate: null },
  { vendor: 'Adobe', category: 'Software', min: 20, max: 60, taxRate: null },
  { vendor: 'Slack', category: 'Software', min: 8, max: 150, taxRate: null },
  { vendor: 'AT&T', category: 'Utilities', min: 45, max: 180, taxRate: 0.07 },
  { vendor: 'Pacific Gas & Electric', category: 'Utilities', min: 60, max: 240, taxRate: 0.05 },
];

const UNCERTAIN_FIELDS: ExtractedFields['uncertainField'][] = [
  'amount',
  'date',
  'taxAmount',
  'vendor',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function recentIsoDate(): string {
  const daysAgo = Math.floor(Math.random() * 21);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function extractReceipt(file: File): Promise<ExtractedFields> {
  void file; // real implementation would send the file to the extraction service
  const wait = 1000 + Math.random() * 1000; // 1–2 s

  return new Promise((resolve) => {
    setTimeout(() => {
      const sample = pick(SAMPLE_VENDORS);
      const amount = round2(sample.min + Math.random() * (sample.max - sample.min));
      const taxAmount =
        sample.taxRate === null ? null : round2(amount * sample.taxRate);

      // Mock: randomly flag 0–1 field the AI was "unsure" about (~40% chance).
      const uncertainField =
        Math.random() < 0.4 ? pick(UNCERTAIN_FIELDS) : null;

      resolve({
        vendor: sample.vendor,
        amount,
        currency: 'USD',
        date: recentIsoDate(),
        category: sample.category,
        taxAmount,
        uncertainField,
      });
    }, wait);
  });
}
