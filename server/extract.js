import Anthropic from '@anthropic-ai/sdk';

// Extraction service. When ANTHROPIC_API_KEY is set, calls Claude with vision to
// extract structured receipt fields from the uploaded image. Otherwise falls
// back to the randomized mock logic ported from src/api/mockExtraction.ts so the
// app works with no key configured.

const CATEGORIES = ['Meals', 'Travel', 'Office Supplies', 'Software', 'Utilities', 'Other'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'];
const MODEL = 'claude-sonnet-5';

export const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

// ---- Mock path (ported from src/api/mockExtraction.ts) ----

const SAMPLE_VENDORS = [
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

const UNCERTAIN_FIELDS = ['amount', 'date', 'taxAmount', 'vendor'];

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function recentIsoDate() {
  const daysAgo = Math.floor(Math.random() * 21);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function mockExtract() {
  const sample = pick(SAMPLE_VENDORS);
  const amount = round2(sample.min + Math.random() * (sample.max - sample.min));
  const taxAmount = sample.taxRate === null ? null : round2(amount * sample.taxRate);
  const uncertainField = Math.random() < 0.4 ? pick(UNCERTAIN_FIELDS) : null;
  return {
    vendor: sample.vendor,
    amount,
    currency: 'USD',
    date: recentIsoDate(),
    category: sample.category,
    taxAmount,
    uncertainField,
  };
}

// ---- Real Claude path ----

function coerceFields(raw) {
  const vendor = typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : 'Unknown vendor';

  let amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) amount = 0;
  amount = round2(amount);

  let currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : 'USD';
  if (!CURRENCIES.includes(currency)) currency = 'USD';

  let date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().slice(0, 10);

  let category = typeof raw.category === 'string' ? raw.category.trim() : 'Other';
  if (!CATEGORIES.includes(category)) category = 'Other';

  let taxAmount = raw.taxAmount;
  if (taxAmount === null || taxAmount === undefined || taxAmount === '') {
    taxAmount = null;
  } else {
    const n = Number(taxAmount);
    taxAmount = Number.isFinite(n) && n >= 0 ? round2(n) : null;
  }

  return { vendor, amount, currency, date, category, taxAmount };
}

async function claudeExtract(buffer, mediaType) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const prompt = [
    'You are a receipt data extractor. Look at the receipt image and extract these fields.',
    'Respond with STRICT JSON only (no markdown, no prose), with exactly these keys:',
    '{"vendor": string, "amount": number, "currency": string, "date": string, "category": string, "taxAmount": number|null}',
    '',
    '- amount: the grand total as a number (no currency symbol).',
    '- currency: 3-letter ISO code, one of USD, EUR, GBP, CAD. Default USD if unclear.',
    '- date: the receipt/purchase date in YYYY-MM-DD format.',
    `- category: exactly one of ${CATEGORIES.join(', ')}. Pick the best fit; use Other if unsure.`,
    '- taxAmount: the tax/VAT amount as a number, or null if none is shown.',
  ].join('\n');

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Extract the JSON object from the response, tolerating stray text/fences.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude response did not contain JSON');
  const parsed = JSON.parse(match[0]);
  return coerceFields(parsed);
}

// mediaType must be an image/* type accepted by the vision API. PDFs are not
// image-decodable here, so callers pass images; PDFs fall through to mock.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function extractFields(buffer, mediaType) {
  if (hasApiKey && buffer && IMAGE_TYPES.has(mediaType)) {
    try {
      return await claudeExtract(buffer, mediaType);
    } catch (err) {
      // Never leak the key; log only the message. Degrade to mock so the
      // upload flow still completes.
      console.warn('[extract] Claude extraction failed, falling back to mock:', err?.message || err);
      return mockExtract();
    }
  }
  return mockExtract();
}
