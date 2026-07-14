export type Category =
  | 'Meals'
  | 'Travel'
  | 'Office Supplies'
  | 'Software'
  | 'Utilities'
  | 'Other';

export type ReceiptSource = 'upload' | 'email';

export type ReceiptStatus = 'processing' | 'needs_review' | 'confirmed';

export type Receipt = {
  id: string;
  imageUrl: string;
  vendor: string;
  amount: number;
  currency: string;
  date: string; // ISO date YYYY-MM-DD
  category: Category;
  taxAmount: number | null;
  source: ReceiptSource;
  status: ReceiptStatus;
  createdAt: string; // ISO datetime
  // Optional email metadata for the inbox stub (source === 'email').
  emailFrom?: string;
  emailSubject?: string;
  // Mock: field the AI was unsure about, e.g. 'amount'. UI shows a "Check this" flag.
  uncertainField?: keyof Pick<Receipt, 'vendor' | 'amount' | 'date' | 'category' | 'taxAmount'> | null;
};

export type ExtractedFields = {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  category: Category;
  taxAmount: number | null;
  uncertainField?: Receipt['uncertainField'];
};
