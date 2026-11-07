// The schema is created on first use, so a fresh D1 database needs no manual
// migration step. migrations/0001_init.sql holds the same SQL for reference.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    submission_id TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    service TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    contact_pref TEXT,
    description TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    terms_version TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    quote_amount TEXT NOT NULL DEFAULT '',
    approved_rev TEXT NOT NULL DEFAULT '',
    paid INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_enquiries_ip ON enquiries (ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS enquiry_files (
    id TEXT PRIMARY KEY,
    enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
    r2_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_files_enquiry ON enquiry_files (enquiry_id)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enquiry_id TEXT NOT NULL,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_enquiry ON events (enquiry_id)`,
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export const STATUSES = [
  ["new", "New"],
  ["needs_info", "Waiting on customer info"],
  ["quoted", "Quote sent"],
  ["accepted", "Quote accepted"],
  ["drawing_sent", "Drawing sent for approval"],
  ["approved", "Drawing approved"],
  ["printing", "Printing"],
  ["ready", "Ready for pickup or posting"],
  ["done", "Done"],
  ["declined", "Declined or not a fit"],
  ["cancelled", "Cancelled by customer"],
];
