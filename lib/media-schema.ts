// Durable images for stateless deployments; existing menu and CRM tables are unchanged.
export const mediaSchema = `
CREATE TABLE IF NOT EXISTS media_files (
  kind TEXT NOT NULL CHECK (kind IN ('photo','export')),
  filename TEXT NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(kind,filename)
);
INSERT INTO schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;
`;
