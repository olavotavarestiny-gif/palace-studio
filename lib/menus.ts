import { randomUUID } from "node:crypto";
import { db, one, type Connection } from "./db";
import { AppError, menuInput } from "./validation";
import { luandaDate } from "./format";
import type {
  Asset,
  Category,
  Dish,
  Draft,
  MenuItem,
  Publication,
  Settings,
} from "./types";

const dateSql = "to_char(menu_date, 'YYYY-MM-DD') AS menu_date";
export async function settings() {
  return (await one<{ data: Settings }>(
    "SELECT data FROM settings WHERE id=1",
  ))!.data;
}
export function publicUrl() {
  const base = process.env.PUBLIC_URL || "http://127.0.0.1:3000";
  const url = new URL("/menu", base);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("PUBLIC_URL inválido.");
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ALLOW_HTTP_LOCAL &&
    url.protocol !== "https:"
  )
    throw new Error("PUBLIC_URL tem de usar HTTPS em produção.");
  return url.toString();
}
export async function getDraft(date: string): Promise<Draft> {
  return (
    (await one<Draft>(
      `SELECT ${dateSql},items,revision,published_id,updated_at FROM menus WHERE menu_date=$1`,
      [date],
    )) || { menu_date: date, items: [], revision: 0, published_id: null }
  );
}
export async function getPublication(id: string) {
  const pub = await one<Publication>(
    `SELECT id,${dateSql},version,items,published_at,generation_status,generation_error FROM versions WHERE id=$1`,
    [id],
  );
  if (!pub) return null;
  pub.assets = (
    await (
      await db()
    ).query<Asset>(
      "SELECT * FROM assets WHERE version_id=$1 ORDER BY format,page",
      [id],
    )
  ).rows;
  return pub;
}
export async function currentPublication(date = luandaDate()) {
  const menu = await one<{ published_id: string }>(
    "SELECT published_id FROM menus WHERE menu_date=$1",
    [date],
  );
  return menu?.published_id ? getPublication(menu.published_id) : null;
}
export async function listPublications() {
  const rows = (
    await (
      await db()
    ).query<Publication>(
      `SELECT id,${dateSql},version,items,published_at,generation_status,generation_error FROM versions ORDER BY menu_date DESC,version DESC`,
    )
  ).rows;
  const assets = (
    await (await db()).query<Asset>("SELECT * FROM assets ORDER BY format,page")
  ).rows;
  return rows.map((p) => ({
    ...p,
    assets: assets.filter((a) => a.version_id === p.id),
  }));
}
export async function listCategories() {
  return (
    await (
      await db()
    ).query<Category>("SELECT * FROM categories ORDER BY position,name")
  ).rows;
}
export async function listDishes() {
  const rows = (
    await (
      await db()
    ).query<Dish>(
      "SELECT id,category_id,name,description,price,photo,active FROM dishes ORDER BY name",
    )
  ).rows;
  return rows.map((d) => ({ ...d, price: Number(d.price) }));
}
export async function validateItems(items: MenuItem[], tx: Connection) {
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new AppError("Existem identificadores de pratos repetidos.");
  const categories = (await tx.query<Category>("SELECT * FROM categories"))
    .rows;
  const dishes = new Set(
    (await tx.query<{ id: string }>("SELECT id FROM dishes")).rows.map(
      (d) => d.id,
    ),
  );
  return items.map((item) => {
    const cat = categories.find((c) => c.id === item.categoryId);
    if (!cat)
      throw new AppError("Uma categoria já não existe. Actualize a página.");
    if (item.dishId && !dishes.has(item.dishId))
      throw new AppError("Um prato já não existe. Actualize a página.");
    return { ...item, categoryName: cat.name };
  });
}
export async function saveMenu(input: unknown, userId?: string) {
  const { date, revision, items: rawItems } = menuInput.parse(input);
  if (userId && !rawItems.length)
    throw new AppError("Adicione pelo menos um prato antes de publicar.");
  if (userId && date !== luandaDate())
    throw new AppError(
      "Só pode publicar o menu da data actual em Luanda. Guarde as outras datas como rascunho.",
    );
  return (await db()).transaction(async (tx) => {
    await tx.query(
      "INSERT INTO menus(menu_date) VALUES ($1) ON CONFLICT DO NOTHING",
      [date],
    );
    const menu = await one<Draft>(
      "SELECT revision,published_id FROM menus WHERE menu_date=$1 FOR UPDATE",
      [date],
      tx,
    );
    if (menu!.revision !== revision)
      throw new AppError(
        "Este menu foi alterado noutra janela. Guarde uma cópia das alterações e recarregue a página.",
        409,
      );
    const items = await validateItems(rawItems, tx);
    let versionId = menu!.published_id;
    if (userId) {
      const previous = await one<{ version: number }>(
        "SELECT COALESCE(MAX(version),0)::integer AS version FROM versions WHERE menu_date=$1",
        [date],
        tx,
      );
      versionId = randomUUID();
      await tx.query(
        "INSERT INTO versions(id,menu_date,version,items,published_by) VALUES ($1,$2,$3,$4::jsonb,$5)",
        [versionId, date, previous!.version + 1, JSON.stringify(items), userId],
      );
    }
    await tx.query(
      "UPDATE menus SET items=$1::jsonb,revision=revision+1,published_id=$2,updated_at=NOW() WHERE menu_date=$3",
      [JSON.stringify(items), versionId, date],
    );
    return {
      draft: {
        menu_date: date,
        items,
        revision: revision + 1,
        published_id: versionId,
      } as Draft,
      versionId: userId ? versionId : null,
    };
  });
}
export async function previousMenu(date: string) {
  const row = await one<{ items: MenuItem[] }>(
    "SELECT v.items FROM menus m JOIN versions v ON v.id=m.published_id WHERE m.menu_date<$1 ORDER BY m.menu_date DESC LIMIT 1",
    [date],
  );
  if (!row)
    throw new AppError(
      "Ainda não existe um menu anterior publicado. Seleccione pratos da biblioteca.",
    );
  const cats = await listCategories();
  const ids = new Set(cats.filter((c) => c.active).map((c) => c.id));
  return row.items
    .filter((i) => ids.has(i.categoryId))
    .map((i) => ({ ...i, id: randomUUID() }));
}
