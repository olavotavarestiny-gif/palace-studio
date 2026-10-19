import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, dataDir, one, type Connection } from "./db";
import { AppError } from "./validation";

export type MediaKind = "photo" | "export";
function localPath(kind: MediaKind, filename: string) {
  if (!/^[a-f0-9-]+(?:-(?:feed|story)-\d+)?\.(?:png|webp)$/.test(filename))
    throw new AppError("Nome de imagem inválido.");
  return path.join(
    dataDir(),
    kind === "photo" ? "photos" : "exports",
    filename,
  );
}

export async function saveMedia(
  kind: MediaKind,
  filename: string,
  content: Uint8Array,
  connection?: Connection,
) {
  const file = localPath(kind, filename);
  const saved = await (connection || (await db())).query(
    "INSERT INTO media_files(kind,filename,content) VALUES($1,$2,$3) ON CONFLICT(kind,filename) DO UPDATE SET filename=media_files.filename WHERE media_files.content=EXCLUDED.content RETURNING filename",
    [kind, filename, Buffer.from(content)],
  );
  if (!saved.rows.length)
    throw new AppError("Já existe uma imagem diferente com este nome.", 409);
  // PostgreSQL is authoritative. A local copy is only a convenience for offline backups.
  if (!process.env.VERCEL) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    } catch {
      console.warn(
        "Imagem preservada no PostgreSQL; cópia local indisponível.",
      );
    }
  }
}

export async function readMedia(kind: MediaKind, filename: string) {
  const file = localPath(kind, filename);
  const stored = await one<{ content: Uint8Array }>(
    "SELECT content FROM media_files WHERE kind=$1 AND filename=$2",
    [kind, filename],
  );
  if (stored) return Buffer.from(stored.content);
  // Import legacy local images on demand. Vercel never depends on local files.
  if (!process.env.VERCEL) {
    try {
      const content = await readFile(file);
      await saveMedia(kind, filename, content);
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new AppError("Imagem não encontrada.", 404);
}
