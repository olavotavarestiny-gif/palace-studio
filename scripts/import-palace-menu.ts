import { randomUUID } from "node:crypto";
import { db, one } from "../lib/db";
import { dishInput } from "../lib/validation";
import source from "../imports/palace-menu-2026-10-19.json";
import { loadEnvConfig } from "@next/env";

// In embedded PostgreSQL mode, stop the application before executing this CLI.
// Existing dishes are preserved; this operation never publishes a menu.
async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const database = await db();
  const result = await database.transaction(async (tx) => {
    const before = await one<{ menus: number; versions: number }>(
      "SELECT (SELECT COUNT(*) FROM menus)::integer AS menus,(SELECT COUNT(*) FROM versions)::integer AS versions",
      [],
      tx,
    );
    const max = await one<{ position: number }>(
      "SELECT COALESCE(MAX(position),-1)::integer AS position FROM categories",
      [],
      tx,
    );
    let position = max!.position + 1;
    let categoriesCreated = 0,
      dishesCreated = 0;
    const existingDishes: string[] = [];
    for (const category of source.categories) {
      let record = await one<{ id: string }>(
        "SELECT id FROM categories WHERE LOWER(BTRIM(name))=LOWER($1) ORDER BY position LIMIT 1",
        [category.name],
        tx,
      );
      if (!record) {
        record = { id: randomUUID() };
        await tx.query(
          "INSERT INTO categories(id,name,position,active) VALUES ($1,$2,$3,TRUE)",
          [record.id, category.name, position++],
        );
        categoriesCreated++;
      }
      for (const dish of category.dishes) {
        const existing = await one<{ id: string }>(
          "SELECT id FROM dishes WHERE LOWER(BTRIM(name))=LOWER($1) LIMIT 1",
          [dish.name],
          tx,
        );
        if (existing) {
          existingDishes.push(dish.name);
          continue;
        }
        const input = dishInput.parse({
          ...dish,
          category_id: record.id,
          description: "description" in dish ? dish.description : "",
          photo: null,
          active: true,
        });
        await tx.query(
          "INSERT INTO dishes(id,category_id,name,description,price,photo,active) VALUES ($1,$2,$3,$4,$5,NULL,TRUE)",
          [
            randomUUID(),
            input.category_id,
            input.name,
            input.description,
            input.price,
          ],
        );
        dishesCreated++;
      }
    }
    const after = await one<{ menus: number; versions: number }>(
      "SELECT (SELECT COUNT(*) FROM menus)::integer AS menus,(SELECT COUNT(*) FROM versions)::integer AS versions",
      [],
      tx,
    );
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("A importação não pode alterar menus ou publicações.");
    const dishes = (
      await tx.query<{
        name: string;
        category: string;
        price: string;
        description: string;
      }>(
        "SELECT d.name,c.name AS category,d.price,d.description FROM dishes d JOIN categories c ON c.id=d.category_id ORDER BY c.position,d.name",
      )
    ).rows;
    return {
      categoriesCreated,
      dishesCreated,
      existingDishes,
      menusUnchanged: true,
      dishes,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
