import { NextResponse } from "next/server";
import { currentPublication } from "@/lib/menus";
import { luandaDate } from "@/lib/format";
export const dynamic = "force-dynamic";
export async function GET() {
  const date = luandaDate(),
    publication = await currentPublication(date);
  const categories = publication
    ? [...new Set(publication.items.map((i) => i.categoryId))].map((id) => ({
        id,
        title: publication.items.find((i) => i.categoryId === id)!.categoryName,
        subtitle: publication.items.find((i) => i.categoryId === id)!
          .categoryName,
        items: publication.items
          .filter((i) => i.categoryId === id)
          .map((i) => ({
            name: i.name,
            description: i.description,
            price: i.price,
          })),
      }))
    : [];
  return NextResponse.json(
    { date, status: publication ? "published" : "unavailable", categories },
    { headers: { "Cache-Control": "no-store" } },
  );
}
