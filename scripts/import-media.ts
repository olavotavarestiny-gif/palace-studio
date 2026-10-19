import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, dataDir } from "../lib/db";
import { saveMedia, type MediaKind } from "../lib/media";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

async function main() {
  const database = await db();
  const files: { kind: MediaKind; filename: string }[] = (
    await database.query<{ filename: string }>("SELECT filename FROM assets")
  ).rows.map((row) => ({ kind: "export", filename: row.filename }));
  const photos = (
    await database.query<{ photo: string }>(
      "SELECT photo FROM dishes WHERE photo IS NOT NULL UNION SELECT item->>'photo' AS photo FROM versions, jsonb_array_elements(items) item WHERE item->>'photo' IS NOT NULL",
    )
  ).rows;
  for (const { photo } of photos) {
    if (!/^\/api\/photos\/[a-f0-9-]+\.webp$/.test(photo))
      throw new Error(
        "Referência de fotografia não suportada; importação interrompida.",
      );
    files.push({ kind: "photo", filename: path.basename(photo) });
  }
  const contents: { kind: MediaKind; filename: string; content: Buffer }[] = [];
  for (const file of files) {
    if (path.basename(file.filename) !== file.filename)
      throw new Error("Nome de ficheiro inválido.");
    const content = await readFile(
      path.join(
        dataDir(),
        file.kind === "photo" ? "photos" : "exports",
        file.filename,
      ),
    );
    contents.push({ ...file, content });
  }
  await database.transaction(async (tx) => {
    for (const file of contents) {
      await saveMedia(file.kind, file.filename, file.content, tx);
      const stored = (
        await tx.query<{ content: Uint8Array }>(
          "SELECT content FROM media_files WHERE kind=$1 AND filename=$2",
          [file.kind, file.filename],
        )
      ).rows[0];
      if (!stored || hash(stored.content) !== hash(file.content))
        throw new Error(
          "A verificação da imagem falhou; importação revertida.",
        );
    }
  });
  console.log(
    JSON.stringify({
      imported: contents.length,
      bytes: contents.reduce((sum, file) => sum + file.content.length, 0),
      contentVerified: true,
      localFilesPreserved: true,
    }),
  );
}
main()
  .then(() => process.exit(0))
  .catch(() => {
    console.error(
      "Não foi possível importar as imagens. A transacção foi revertida; os ficheiros locais permanecem preservados.",
    );
    process.exit(1);
  });
