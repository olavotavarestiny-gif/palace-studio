import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import { crmSchema } from "./crm-schema";
import { mediaSchema } from "./media-schema";

export const dataDir = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "./data");
export interface Connection {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
interface Database extends Connection {
  transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T>;
}
const schema = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL);
INSERT INTO settings (id, data) VALUES (1, '{"restaurantName":"Palace Lounge","website":"","contact":""}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS dishes (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price NUMERIC(14,2) NOT NULL CHECK (price >= 0), photo TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS menus (menu_date DATE PRIMARY KEY, items JSONB NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 0, published_id TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, menu_date DATE NOT NULL REFERENCES menus(menu_date), version INTEGER NOT NULL, items JSONB NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_by TEXT NOT NULL REFERENCES users(id), generation_status TEXT NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending','generating','ready','error')), generation_error TEXT, generation_started_at TIMESTAMPTZ, UNIQUE(menu_date, version));
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), format TEXT NOT NULL CHECK (format IN ('feed', 'story')), page INTEGER NOT NULL CHECK (page > 0), filename TEXT NOT NULL UNIQUE, generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(version_id, format, page));
CREATE INDEX IF NOT EXISTS versions_date ON versions(menu_date DESC, version DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menus_published_version_fkey') THEN
    ALTER TABLE menus ADD CONSTRAINT menus_published_version_fkey FOREIGN KEY (published_id) REFERENCES versions(id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
`;

const g = globalThis as typeof globalThis & { palaceDb?: Promise<Database> };
export async function db(): Promise<Database> {
  if (!g.palaceDb)
    g.palaceDb = (async () => {
      if (process.env.DATABASE_URL) {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: process.env.VERCEL ? 2 : 8,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
        });
        try {
          await pool.query(schema + crmSchema + mediaSchema);
        } catch (error) {
          await pool.end();
          throw error;
        }
        return {
          query: async <T>(sql: string, params?: unknown[]) => ({
            rows: (await pool.query(sql, params)).rows as T[],
          }),
          transaction: async <T>(fn: (tx: Connection) => Promise<T>) => {
            const client: PoolClient = await pool.connect();
            try {
              await client.query("BEGIN");
              const result = await fn(client as Connection);
              await client.query("COMMIT");
              return result;
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            } finally {
              client.release();
            }
          },
        };
      }
      if (
        process.env.NODE_ENV === "production" &&
        !process.env.ALLOW_EMBEDDED_DB
      )
        throw new Error("Configure DATABASE_URL para produção.");
      await mkdir(dataDir(), { recursive: true, mode: 0o700 });
      const pg = new PGlite([dataDir(), "postgres"].join(path.sep));
      await pg.exec(schema + crmSchema + mediaSchema);
      return {
        query: async <T>(sql: string, params?: unknown[]) => ({
          rows: (await pg.query(sql, params)).rows as T[],
        }),
        transaction: <T>(fn: (tx: Connection) => Promise<T>) =>
          pg.transaction((tx) => fn(tx as Connection)),
      };
    })().catch((error) => {
      g.palaceDb = undefined;
      throw error;
    });
  return g.palaceDb;
}
export async function one<T>(
  sql: string,
  params: unknown[] = [],
  connection?: Connection,
) {
  return (
    (await (connection || (await db())).query<T>(sql, params)).rows[0] ?? null
  );
}
