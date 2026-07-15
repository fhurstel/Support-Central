import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedReceipts } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.RECEIPTS_DB_PATH || path.join(__dirname, 'receipts.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    imageUrl TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    taxAmount REAL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    emailFrom TEXT,
    emailSubject TEXT,
    uncertainField TEXT
  );
`);

// Seed the DB on first run so first-run experience matches the old localStorage seed.
const count = db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO receipts
      (id, imageUrl, vendor, amount, currency, date, category, taxAmount, source, status, createdAt, emailFrom, emailSubject, uncertainField)
    VALUES
      (@id, @imageUrl, @vendor, @amount, @currency, @date, @category, @taxAmount, @source, @status, @createdAt, @emailFrom, @emailSubject, @uncertainField)
  `);
  const seedAll = db.transaction((rows) => {
    for (const r of rows) insert.run(normalizeForInsert(r));
  });
  seedAll(buildSeedReceipts());
}

// SQLite stores no undefined — coerce optional fields to null.
function normalizeForInsert(r) {
  return {
    id: r.id,
    imageUrl: r.imageUrl ?? '',
    vendor: r.vendor,
    amount: r.amount,
    currency: r.currency,
    date: r.date,
    category: r.category,
    taxAmount: r.taxAmount ?? null,
    source: r.source,
    status: r.status,
    createdAt: r.createdAt,
    emailFrom: r.emailFrom ?? null,
    emailSubject: r.emailSubject ?? null,
    uncertainField: r.uncertainField ?? null,
  };
}

// Convert a DB row into the Receipt shape the frontend expects (drop null
// optional fields so JSON matches the old client shape closely enough).
function rowToReceipt(row) {
  if (!row) return null;
  const receipt = {
    id: row.id,
    imageUrl: row.imageUrl,
    vendor: row.vendor,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    category: row.category,
    taxAmount: row.taxAmount === null ? null : row.taxAmount,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt,
    uncertainField: row.uncertainField ?? null,
  };
  if (row.emailFrom != null) receipt.emailFrom = row.emailFrom;
  if (row.emailSubject != null) receipt.emailSubject = row.emailSubject;
  return receipt;
}

function sortByDateDesc(receipts) {
  return [...receipts].sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
}

export function listReceipts() {
  const rows = db.prepare('SELECT * FROM receipts').all();
  return sortByDateDesc(rows.map(rowToReceipt));
}

export function getReceipt(id) {
  return rowToReceipt(db.prepare('SELECT * FROM receipts WHERE id = ?').get(id));
}

export function createReceipt(receipt) {
  const insert = db.prepare(`
    INSERT INTO receipts
      (id, imageUrl, vendor, amount, currency, date, category, taxAmount, source, status, createdAt, emailFrom, emailSubject, uncertainField)
    VALUES
      (@id, @imageUrl, @vendor, @amount, @currency, @date, @category, @taxAmount, @source, @status, @createdAt, @emailFrom, @emailSubject, @uncertainField)
  `);
  insert.run(normalizeForInsert(receipt));
  return getReceipt(receipt.id);
}

export function updateReceipt(id, patch) {
  const existing = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = normalizeForInsert({ ...rowToReceipt(existing), ...patch, id });
  db.prepare(`
    UPDATE receipts SET
      imageUrl = @imageUrl,
      vendor = @vendor,
      amount = @amount,
      currency = @currency,
      date = @date,
      category = @category,
      taxAmount = @taxAmount,
      source = @source,
      status = @status,
      createdAt = @createdAt,
      emailFrom = @emailFrom,
      emailSubject = @emailSubject,
      uncertainField = @uncertainField
    WHERE id = @id
  `).run(merged);
  return getReceipt(id);
}

export function deleteReceipt(id) {
  db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
}

export default db;
