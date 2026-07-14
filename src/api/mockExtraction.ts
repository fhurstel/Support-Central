import type { ExtractedFields } from '../types';

// Real AI extraction: sends the uploaded file to POST /api/extract (Claude-powered
// when the server has ANTHROPIC_API_KEY, mock otherwise). The return shape
// (`extractReceipt(file): Promise<ExtractedFields>`) is unchanged from the old mock.

export async function extractReceipt(file: File): Promise<ExtractedFields> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch('/api/extract', { method: 'POST', body: form });
  if (!res.ok) {
    let message = `Extraction failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const fields = (await res.json()) as ExtractedFields;
  return {
    vendor: fields.vendor,
    amount: fields.amount,
    currency: fields.currency,
    date: fields.date,
    category: fields.category,
    taxAmount: fields.taxAmount ?? null,
    uncertainField: fields.uncertainField ?? null,
  };
}
