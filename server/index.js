import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load a repo-root .env if present (Node 20.12+/22 built-in), before other
// modules read process.env. Optional — absence is fine (mock mode).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // no .env file — running with whatever env is already set (mock fallback if no key)
}

const express = (await import('express')).default;
const cors = (await import('cors')).default;
const multer = (await import('multer')).default;
const store = await import('./db.js');
const { extractFields, hasApiKey } = await import('./extract.js');

const app = express();
const PORT = process.env.PORT || 3001;

// JSON bodies can be large (base64 data-URL images), so bump the limit.
app.use(express.json({ limit: '15mb' }));
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---- CRUD ----

app.get('/api/receipts', (_req, res) => {
  res.json(store.listReceipts());
});

app.get('/api/receipts/:id', (req, res) => {
  const receipt = store.getReceipt(req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Not found' });
  res.json(receipt);
});

app.post('/api/receipts', (req, res) => {
  const body = req.body;
  if (!body || !body.id) return res.status(400).json({ error: 'Missing receipt id' });
  try {
    res.status(201).json(store.createReceipt(body));
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Create failed' });
  }
});

app.patch('/api/receipts/:id', (req, res) => {
  const updated = store.updateReceipt(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.delete('/api/receipts/:id', (req, res) => {
  store.deleteReceipt(req.params.id);
  res.status(204).end();
});

// ---- Extraction ----

app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    const mediaType = req.file?.mimetype;
    const fields = await extractFields(buffer, mediaType);
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Extraction failed' });
  }
});

app.listen(PORT, () => {
  console.log(`ReceiptPilot API listening on http://localhost:${PORT}`);
  if (hasApiKey) {
    console.log('[extract] ANTHROPIC_API_KEY detected — using real Claude extraction.');
  } else {
    console.log('[extract] No ANTHROPIC_API_KEY set — running in MOCK extraction mode.');
  }
});
