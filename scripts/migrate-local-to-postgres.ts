import { loadEnvConfig } from "@next/env";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { access, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { db, dataDir, type Connection } from "../lib/db";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const tables = [
  "users",
  "categories",
  "dishes",
  "customers",
  "reservations",
  "menus",
  "versions",
  "assets",
  "crm_audit",
  "settings",
  "media_files",
] as const;
type Table = (typeof tables)[number];
type Row = Record<string, unknown>;
type Snapshot = Record<Table, Row[]>;
const apply = process.argv.includes("--apply");

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function digest(rows: Row[]) {
  return createHash("sha256")
    .update(rows.map(canonical).sort().join("\n"))
    .digest("hex");
}
async function readRows(connection: Connection, table: Table) {
  return (
    await connection.query<{ row: Row }>(
      `SELECT to_jsonb(t) AS row FROM ${table} t`,
    )
  ).rows.map((item) => item.row);
}
async function assertEmpty(connection: Connection) {
  const existing = (
    await connection.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    )
  ).rows.map((row) => row.table_name);
  const allowed = [
    ...tables,
    "schema_migrations",
    "sessions",
    "auth_attempts",
    "crm_rate_limits",
  ];
  if (existing.some((table) => !allowed.includes(table as Table)))
    throw new Error(
      "O destino contém tabelas inesperadas; transferência recusada.",
    );
  for (const table of existing) {
    if (table === "schema_migrations") continue;
    if (table === "settings") {
      const settings = await readRows(connection, "settings");
      if (
        settings.length > 1 ||
        settings.some(
          (row) =>
            row.id !== 1 ||
            canonical(row.data) !==
              canonical({
                restaurantName: "Palace Lounge",
                website: "",
                contact: "",
              }),
        )
      )
        throw new Error(
          "O destino já contém definições próprias; transferência recusada.",
        );
    } else {
      const result = await connection.query<{ count: number }>(
        `SELECT COUNT(*)::integer AS count FROM ${table}`,
      );
      if (result.rows[0].count)
        throw new Error(
          `O destino já contém dados em ${table}; transferência recusada.`,
        );
    }
  }
}

async function main() {
  const index = process.argv.indexOf("--source");
  if (index < 0 || !process.argv[index + 1])
    throw new Error(
      "Indique --source <copia-offline/postgres>. Sem --apply, apenas verifica e exporta a cópia.",
    );
  if (!process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL para o PostgreSQL de destino.");
  const sourcePath = await realpath(process.argv[index + 1]);
  if (sourcePath === (await realpath(path.join(dataDir(), "postgres"))))
    throw new Error(
      "Use uma cópia de segurança offline, não a base local original.",
    );
  const source = new PGlite(sourcePath);
  const inspection = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  try {
    const snapshot = await source.transaction(async (tx) => {
      await tx.query("SET LOCAL TIME ZONE 'UTC'");
      const result = {} as Snapshot;
      const available = (
        await tx.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
        )
      ).rows.map((row) => row.table_name);
      for (const table of tables)
        result[table] =
          table === "media_files" && !available.includes(table)
            ? []
            : await readRows(tx as Connection, table);
      return result;
    });
    for (const asset of snapshot.assets) {
      if (
        typeof asset.filename !== "string" ||
        path.basename(asset.filename) !== asset.filename
      )
        throw new Error("Referência de imagem inválida na cópia.");
      await access(path.join(sourcePath, "..", "exports", asset.filename));
    }
    await writeFile(
      path.join(sourcePath, "..", `logical-snapshot-${Date.now()}.json`),
      JSON.stringify(snapshot),
      { mode: 0o600, flag: "wx" },
    );
    const counts = Object.fromEntries(
      tables.map((table) => [table, snapshot[table].length]),
    );
    await assertEmpty(inspection as Connection);
    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: "preview",
            counts,
            targetEmpty: true,
            sourceDigest: digest(tables.flatMap((table) => snapshot[table])),
          },
          null,
          2,
        ),
      );
      return;
    }
    const target = await db();
    await target.transaction(async (tx) => {
      await tx.query(
        `LOCK TABLE ${[...tables, "sessions", "auth_attempts", "crm_rate_limits"].join(",")} IN ACCESS EXCLUSIVE MODE`,
      );
      await tx.query("SET LOCAL TIME ZONE 'UTC'");
      await assertEmpty(tx);
      for (const table of tables) {
        for (const original of snapshot[table]) {
          const row =
            table === "menus" ? { ...original, published_id: null } : original;
          const conflict =
            table === "settings"
              ? " ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data"
              : "";
          await tx.query(
            `INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb) WHERE true${conflict}`,
            [JSON.stringify(row)],
          );
        }
      }
      for (const menu of snapshot.menus)
        await tx.query("UPDATE menus SET published_id=$1 WHERE menu_date=$2", [
          menu.published_id,
          menu.menu_date,
        ]);
      for (const table of tables)
        if (digest(await readRows(tx, table)) !== digest(snapshot[table]))
          throw new Error(
            `A verificação de conteúdo falhou em ${table}; a transacção será revertida.`,
          );
    });
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          counts,
          contentVerified: true,
          originalLocalDatabasePreserved: true,
          sessionsTransferred: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await source.close();
    await inspection.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // PostgreSQL messages can contain row values. Do not print database errors or credentials.
    console.error(
      error instanceof Error && !("severity" in error)
        ? error.message.replace(
            /postgres(?:ql)?:\/\/[^\s]+/g,
            "<ligacao omitida>",
          )
        : "Transferência recusada ou revertida; verificar o destino sem expor dados pessoais.",
    );
    process.exit(1);
  });
