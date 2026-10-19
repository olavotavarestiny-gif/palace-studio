// Additive migration: preserves the existing menus, users, dishes and publications.
export const crmSchema = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL UNIQUE,
  email TEXT,
  birthday DATE,
  vip BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN ('website','manual')),
  notes TEXT NOT NULL DEFAULT '',
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consented_at TIMESTAMPTZ,
  marketing_consent_source TEXT,
  marketing_consent_text TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT marketing_consent OR (marketing_consented_at IS NOT NULL AND marketing_consent_source IS NOT NULL AND marketing_consent_text IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_normalized_phone TEXT NOT NULL,
  contact_email TEXT,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 50),
  occasion TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled','completed')),
  source TEXT NOT NULL CHECK (source IN ('website','manual')),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  privacy_accepted_at TIMESTAMPTZ,
  privacy_notice TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reservations_date_time ON reservations(reservation_date,reservation_time);
CREATE INDEX IF NOT EXISTS reservations_status ON reservations(status,created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_customer ON reservations(customer_id,reservation_date DESC);
CREATE TABLE IF NOT EXISTS crm_audit (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer','reservation','privacy')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_audit_entity ON crm_audit(entity_type,entity_id,created_at DESC);
CREATE TABLE IF NOT EXISTS crm_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
INSERT INTO schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
`;
