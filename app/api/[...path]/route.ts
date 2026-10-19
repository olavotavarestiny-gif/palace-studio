import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import QRCode from "qrcode";
import JSZip from "jszip";
import sharp from "sharp";
import { z, ZodError } from "zod";
import { db, one } from "@/lib/db";
import { readMedia, saveMedia } from "@/lib/media";
import {
  requireUser,
  createSession,
  firstAdmin,
  login,
  hashToken,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  accountInput,
  AppError,
  categoryInput,
  dishInput,
  settingsInput,
} from "@/lib/validation";
import {
  currentPublication,
  getDraft,
  getPublication,
  listCategories,
  listDishes,
  listPublications,
  previousMenu,
  publicUrl,
  saveMenu,
  settings,
} from "@/lib/menus";
import { generatePublication, renderMenu } from "@/lib/render";
import { luandaDate } from "@/lib/format";
import type { Asset } from "@/lib/types";
import { assertSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_500_000)
    throw new AppError("Pedido demasiado grande.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Pedido inválido.");
  }
}
function downloadName(date: string, format: string, page: number) {
  return `palace-menu-${date}-${format}-${String(page).padStart(2, "0")}.png`;
}
function binary(buffer: Uint8Array, type: string, filename?: string) {
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= buffer.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(
        new Uint8Array(buffer.subarray(offset, offset + 65536)),
      );
      offset += 65536;
    },
  });
  return streamed(stream, type, filename);
}
function streamed(
  stream: ReadableStream<Uint8Array>,
  type: string,
  filename?: string,
) {
  return new NextResponse(stream, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      ...(filename
        ? { "Content-Disposition": `attachment; filename="${filename}"` }
        : {}),
    },
  });
}
async function handle(req: NextRequest, context: Context) {
  const parts = (await context.params).path;
  const resource = parts.join("/");
  const method = req.method;
  if (method !== "GET") {
    assertSameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 4_000_000)
      throw new AppError("Ficheiro demasiado grande.", 413);
  }
  if (method === "POST" && resource === "auth/login") {
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.trim().toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .parse(await body(req));
    await login(input.email, input.password);
    return json({ ok: true });
  }
  if (method === "POST" && resource === "auth/setup") {
    const input = z
      .object({ ...accountInput.shape, token: z.string().max(256).default("") })
      .parse(await body(req));
    const required = process.env.SETUP_TOKEN;
    if (process.env.NODE_ENV === "production" && !required)
      throw new AppError(
        "A configuração inicial está desactivada. Utilize npm run setup no servidor.",
        403,
      );
    if (required) {
      const a = Buffer.from(input.token),
        b = Buffer.from(required);
      if (a.length !== b.length || !timingSafeEqual(a, b))
        throw new AppError("Código de configuração incorrecto.", 403);
    } else if (
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname)
    )
      throw new AppError(
        "Crie o administrador localmente ou configure SETUP_TOKEN.",
        403,
      );
    const id = await firstAdmin(input.name, input.email, input.password);
    await createSession(id);
    return json({ ok: true });
  }
  // Photos have opaque filenames and are intended for the public menu.
  if (
    method === "GET" &&
    parts[0] === "photos" &&
    /^[a-f0-9-]+\.webp$/.test(parts[1] || "")
  ) {
    try {
      return binary(await readMedia("photo", parts[1]), "image/webp");
    } catch {
      throw new AppError("Fotografia não encontrada.", 404);
    }
  }
  const user = await requireUser();
  const database = await db();
  if (method === "POST" && resource === "auth/logout") {
    const token = (await cookies()).get("palace_session")?.value;
    if (token)
      await database.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(token),
      ]);
    (await cookies()).delete("palace_session");
    return json({ ok: true });
  }
  if (method === "GET" && resource === "state") {
    const today = luandaDate();
    const [categories, dishes, draft, todayPublication, publications, config] =
      await Promise.all([
        listCategories(),
        listDishes(),
        getDraft(today),
        currentPublication(today),
        listPublications(),
        settings(),
      ]);
    return json({
      user,
      today,
      categories,
      dishes,
      draft,
      todayPublication,
      publications,
      publicUrl: publicUrl(),
      settings: config,
    });
  }
  if (method === "POST" && resource === "account") {
    const input = z
      .object({
        name: z.string().trim().min(1).max(160),
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128).optional(),
      })
      .parse(await body(req));
    const stored = await one<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1",
      [user.id],
    );
    if (!(await verifyPassword(input.currentPassword, stored!.password_hash)))
      throw new AppError("A palavra-passe actual está incorrecta.");
    await database.query(
      "UPDATE users SET name=$1,password_hash=$2 WHERE id=$3",
      [
        input.name,
        input.newPassword
          ? await hashPassword(input.newPassword)
          : stored!.password_hash,
        user.id,
      ],
    );
    if (input.newPassword) {
      await database.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      await createSession(user.id);
    }
    return json({ ok: true });
  }
  if (method === "POST" && resource === "settings") {
    const input = settingsInput.parse(await body(req));
    await database.query("UPDATE settings SET data=$1::jsonb WHERE id=1", [
      JSON.stringify(input),
    ]);
    return json({ ok: true });
  }
  if (parts[0] === "categories" && ["POST", "PATCH"].includes(method)) {
    if (resource === "categories/reorder") {
      const ids = z
        .array(z.string().uuid())
        .max(200)
        .parse(await body(req));
      await database.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++)
          await tx.query("UPDATE categories SET position=$1 WHERE id=$2", [
            i,
            ids[i],
          ]);
      });
      return json({ ok: true });
    }
    const input = categoryInput.parse(await body(req));
    const id =
      method === "POST" ? randomUUID() : z.string().uuid().parse(parts[1]);
    if (method === "POST")
      await database.query(
        "INSERT INTO categories(id,name,position,active) VALUES ($1,$2,$3,$4)",
        [id, input.name, input.position, input.active],
      );
    else {
      if (
        !(await one(
          "UPDATE categories SET name=$1,position=$2,active=$3 WHERE id=$4 RETURNING id",
          [input.name, input.position, input.active, id],
        ))
      )
        throw new AppError("Categoria não encontrada.", 404);
    }
    return json({ id });
  }
  if (parts[0] === "dishes" && ["POST", "PATCH"].includes(method)) {
    const input = dishInput.parse(await body(req));
    const id =
      method === "POST" ? randomUUID() : z.string().uuid().parse(parts[1]);
    const existing =
      method === "PATCH"
        ? await one<{ category_id: string }>(
            "SELECT category_id FROM dishes WHERE id=$1",
            [id],
          )
        : null;
    if (
      !(await one(
        "SELECT id FROM categories WHERE id=$1 AND (active=TRUE OR id=$2)",
        [input.category_id, existing?.category_id || null],
      ))
    )
      throw new AppError("Seleccione uma categoria activa.");
    const params = [
      input.name,
      input.category_id,
      input.description,
      input.price,
      input.photo,
      input.active,
      id,
    ];
    if (method === "POST")
      await database.query(
        "INSERT INTO dishes(name,category_id,description,price,photo,active,id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        params,
      );
    else if (
      !(await one(
        "UPDATE dishes SET name=$1,category_id=$2,description=$3,price=$4,photo=$5,active=$6,updated_at=NOW() WHERE id=$7 RETURNING id",
        params,
      ))
    )
      throw new AppError("Prato não encontrado.", 404);
    return json({ id });
  }
  if (method === "POST" && resource === "photos") {
    const data = await req.formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size > 3_000_000 || !file.size)
      throw new AppError("Seleccione uma imagem até 3 MB.");
    const name = `${randomUUID()}.webp`;
    let image: Buffer;
    try {
      image = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError("Imagem inválida. Utilize JPG, PNG ou WebP.");
    }
    await saveMedia("photo", name, image);
    return json({ url: `/api/photos/${name}` });
  }
  if (method === "GET" && resource === "menu") {
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(req.nextUrl.searchParams.get("date") || luandaDate());
    return json(await getDraft(date));
  }
  if (method === "GET" && resource === "menu/previous") {
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(req.nextUrl.searchParams.get("date") || luandaDate());
    return json({ items: await previousMenu(date) });
  }
  if (
    method === "POST" &&
    (resource === "menu/save" || resource === "menu/publish")
  ) {
    const result = await saveMenu(
      await body(req),
      resource === "menu/publish" ? user.id : undefined,
    );
    const generation = result.versionId
      ? await generatePublication(result.versionId)
      : null;
    return json({ ...result, generation });
  }
  if (method === "POST" && resource === "menu/preview") {
    const { menuInput } = await import("@/lib/validation");
    const input = menuInput.parse(await body(req));
    if (!input.items.length)
      throw new AppError("Adicione pratos para pré-visualizar.");
    const format =
      req.nextUrl.searchParams.get("format") === "story" ? "story" : "feed";
    const pages = await renderMenu(input.items, input.date, format);
    return binary(
      Buffer.from(
        JSON.stringify({
          pages: pages.map(
            (b) => `data:image/png;base64,${b.toString("base64")}`,
          ),
        }),
      ),
      "application/json",
    );
  }
  if (
    method === "POST" &&
    parts[0] === "publications" &&
    parts[2] === "generate"
  ) {
    const id = z.string().uuid().parse(parts[1]);
    if (!(await getPublication(id)))
      throw new AppError("Publicação não encontrada.", 404);
    return json(await generatePublication(id));
  }
  if (method === "GET" && parts[0] === "assets") {
    const id = z.string().uuid().parse(parts[1]);
    const asset = await one<Asset & { menu_date: string }>(
      "SELECT a.*,to_char(v.menu_date,'YYYY-MM-DD') AS menu_date FROM assets a JOIN versions v ON v.id=a.version_id WHERE a.id=$1",
      [id],
    );
    if (!asset) throw new AppError("Imagem não encontrada.", 404);
    return binary(
      await readMedia("export", asset.filename),
      "image/png",
      req.nextUrl.searchParams.has("download")
        ? downloadName(asset.menu_date, asset.format, asset.page)
        : undefined,
    );
  }
  if (method === "GET" && parts[0] === "exports") {
    const pub = await getPublication(z.string().uuid().parse(parts[1]));
    if (!pub) throw new AppError("Publicação não encontrada.", 404);
    const format = z.enum(["feed", "story", "all"]).parse(parts[2]);
    const assets = pub.assets.filter(
      (a) => format === "all" || a.format === format,
    );
    if (!assets.length)
      throw new AppError(
        "Ainda não existem imagens. Gere a publicação primeiro.",
        404,
      );
    if (assets.length === 1) {
      const a = assets[0];
      return binary(
        await readMedia("export", a.filename),
        "image/png",
        downloadName(pub.menu_date, a.format, a.page),
      );
    }
    const zip = new JSZip();
    for (const a of assets)
      zip.file(
        downloadName(pub.menu_date, a.format, a.page),
        await readMedia("export", a.filename),
      );
    return streamed(
      Readable.toWeb(
        zip.generateNodeStream({
          type: "nodebuffer",
          streamFiles: true,
        }) as Readable,
      ) as ReadableStream<Uint8Array>,
      "application/zip",
      `palace-menu-${pub.menu_date}-v${pub.version}-${format}.zip`,
    );
  }
  if (method === "GET" && resource === "qr") {
    const svg = req.nextUrl.searchParams.get("format") === "svg";
    const options = {
      margin: 4,
      errorCorrectionLevel: "H" as const,
      color: { dark: "#4F3710", light: "#FFFFFF" },
      width: 1600,
    };
    const content = svg
      ? Buffer.from(
          await QRCode.toString(publicUrl(), { ...options, type: "svg" }),
        )
      : await QRCode.toBuffer(publicUrl(), options);
    return binary(
      content,
      svg ? "image/svg+xml" : "image/png",
      req.nextUrl.searchParams.has("download")
        ? `palace-menu-qr.${svg ? "svg" : "png"}`
        : undefined,
    );
  }
  throw new AppError("Endereço não encontrado.", 404);
}
async function safe(req: NextRequest, context: Context) {
  try {
    return await handle(req, context);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues[0]?.message || "Verifique os dados introduzidos.",
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    console.error("API error", error);
    return json(
      {
        error:
          "Não foi possível concluir. Verifique a ligação e tente novamente.",
      },
      500,
    );
  }
}
export { safe as GET, safe as POST, safe as PATCH };
