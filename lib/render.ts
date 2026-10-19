import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, one } from "./db";
import { saveMedia } from "./media";
import { getPublication } from "./menus";
import { dateLabel, money } from "./format";
import { AppError } from "./validation";
import type { MenuItem } from "./types";

let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded) return;
  // Static font instances keep weight selection consistent in the native renderer.
  for (const weight of [400, 500, 600]) {
    if (
      !GlobalFonts.registerFromPath(
        path.join(process.cwd(), `public/fonts/manrope-${weight}.ttf`),
        "Manrope",
      )
    )
      throw new Error("Não foi possível carregar a fonte Manrope.");
  }
  if (
    !GlobalFonts.registerFromPath(
      path.join(process.cwd(), "public/fonts/cormorant-500.ttf"),
      "Cormorant Garamond",
    )
  )
    throw new Error("Não foi possível carregar a fonte Cormorant Garamond.");
  fontsLoaded = true;
}
export function wrap(ctx: SKRSContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    if (ctx.measureText(word).width > maxWidth) {
      for (const char of word) {
        if (ctx.measureText(line + char).width > maxWidth && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    } else line = word;
  }
  if (line) lines.push(line);
  return lines;
}
type Block = {
  item: MenuItem;
  names: string[];
  descriptions: string[];
  categoryLines: string[];
  height: number;
  priceSize: number;
};
export async function renderMenu(
  items: MenuItem[],
  date: string,
  format: "feed" | "story",
) {
  loadFonts();
  const height = format === "feed" ? 1350 : 1920;
  const canvas = createCanvas(1080, height),
    ctx = canvas.getContext("2d");
  const top = 435,
    bottom = height - 168,
    contentWidth = 840;
  const pages: Block[][] = [];
  let page: Block[] = [],
    y = top,
    category = "";
  for (const item of items) {
    ctx.font = "500 29px Manrope";
    const names = wrap(ctx, item.name, 570);
    ctx.font = "400 21px Manrope";
    const descriptions = wrap(ctx, item.description, contentWidth);
    ctx.font = '500 35px "Cormorant Garamond"';
    const categoryLines = wrap(
      ctx,
      item.categoryName.toLocaleUpperCase("pt"),
      contentWidth,
    );
    const categoryHeight = categoryLines.length * 42 + 26;
    let showCategory = category !== item.categoryId;
    const bodyHeight =
      names.length * 40 +
      (descriptions.length ? descriptions.length * 30 + 10 : 0) +
      30;
    if (bodyHeight + categoryHeight > bottom - top)
      throw new AppError(
        "Uma descrição é demasiado longa para a publicação. Encurte-a no menu e tente novamente.",
      );
    if (
      y + bodyHeight + (showCategory ? categoryHeight : 0) > bottom &&
      page.length
    ) {
      pages.push(page);
      page = [];
      y = top;
      category = "";
      showCategory = true;
    }
    let priceSize = 27;
    ctx.font = `500 ${priceSize}px Manrope`;
    while (ctx.measureText(money(item.price)).width > 245 && priceSize > 20) {
      priceSize--;
      ctx.font = `500 ${priceSize}px Manrope`;
    }
    const block = {
      item,
      names,
      descriptions,
      categoryLines: showCategory ? categoryLines : [],
      height: bodyHeight + (showCategory ? categoryHeight : 0),
      priceSize,
    };
    page.push(block);
    y += block.height;
    category = item.categoryId;
  }
  if (page.length) pages.push(page);
  const logo = await loadImage(
    await readFile(path.join(process.cwd(), "public/brand/logo.jpg")),
  );
  const result: Buffer[] = [];
  for (let index = 0; index < pages.length; index++) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 1080, height);
    ctx.strokeStyle = "#C8A75B";
    ctx.lineWidth = 1;
    ctx.strokeRect(44, 44, 992, height - 88);
    ctx.strokeStyle = "#D4AF37";
    ctx.strokeRect(52, 52, 976, height - 104);
    // Draw the official artwork with its original proportions, excluding blank margins.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(300, 65, 480, 264);
    ctx.drawImage(logo, 20, 148, 933, 596, 355, 75, 370, 236);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6B501F";
    ctx.font = '500 70px "Cormorant Garamond"';
    ctx.fillText("Menu do Dia", 540, 352);
    ctx.font = "400 20px Manrope";
    ctx.fillText(dateLabel(date), 540, 392);
    ctx.strokeStyle = "#C8A75B";
    ctx.beginPath();
    ctx.moveTo(440, 414);
    ctx.lineTo(640, 414);
    ctx.stroke();
    let cursor = top;
    for (const block of pages[index]) {
      ctx.textAlign = "left";
      if (block.categoryLines.length) {
        ctx.fillStyle = "#6B501F";
        ctx.font = '500 35px "Cormorant Garamond"';
        for (const line of block.categoryLines) {
          ctx.fillText(line, 120, cursor + 34);
          cursor += 42;
        }
        cursor += 26;
      }
      ctx.fillStyle = "#4F3710";
      ctx.font = "500 29px Manrope";
      const firstY = cursor + 30;
      for (const line of block.names) {
        ctx.fillText(line, 120, cursor + 30);
        cursor += 40;
      }
      ctx.textAlign = "right";
      ctx.font = `500 ${block.priceSize}px Manrope`;
      ctx.fillText(money(block.item.price), 960, firstY);
      ctx.textAlign = "left";
      ctx.fillStyle = "#6B501F";
      ctx.font = "400 21px Manrope";
      if (block.descriptions.length) {
        cursor += 10;
        for (const line of block.descriptions) {
          ctx.fillText(line, 120, cursor + 23);
          cursor += 30;
        }
      }
      cursor += 30;
    }
    ctx.strokeStyle = "#C8A75B";
    ctx.beginPath();
    ctx.moveTo(120, height - 142);
    ctx.lineTo(960, height - 142);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#6B501F";
    ctx.font = "400 18px Manrope";
    ctx.fillText(
      "P A L A C E  L O U N G E   ·   L U A N D A",
      540,
      height - 102,
    );
    ctx.font = "400 16px Manrope";
    ctx.fillText(
      `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`,
      540,
      height - 72,
    );
    result.push(canvas.toBuffer("image/png"));
  }
  return result;
}

export async function generatePublication(
  id: string,
  renderer: typeof renderMenu = renderMenu,
) {
  const database = await db();
  const claimed = await one<{ id: string }>(
    "UPDATE versions SET generation_status='generating',generation_error=NULL,generation_started_at=NOW() WHERE id=$1 AND (generation_status<>'generating' OR generation_started_at<NOW()-INTERVAL '5 minutes') RETURNING id",
    [id],
  );
  if (!claimed)
    throw new AppError(
      "Esta publicação já está a ser gerada. Aguarde alguns instantes.",
      409,
    );
  try {
    const pub = await getPublication(id);
    if (!pub) throw new AppError("Publicação não encontrada.", 404);
    const runId = randomUUID();
    const assets: {
      id: string;
      format: string;
      page: number;
      filename: string;
      content: Buffer;
    }[] = [];
    for (const format of ["feed", "story"] as const) {
      const images = await renderer(pub.items, pub.menu_date, format);
      for (let i = 0; i < images.length; i++) {
        const assetId = randomUUID();
        const filename = `${runId}-${format}-${i + 1}.png`;
        assets.push({
          id: assetId,
          format,
          page: i + 1,
          filename,
          content: images[i],
        });
      }
    }
    await database.transaction(async (tx) => {
      await tx.query(
        "DELETE FROM media_files WHERE kind='export' AND filename IN (SELECT filename FROM assets WHERE version_id=$1)",
        [id],
      );
      await tx.query("DELETE FROM assets WHERE version_id=$1", [id]);
      for (const asset of assets) {
        await saveMedia("export", asset.filename, asset.content, tx);
        await tx.query(
          "INSERT INTO assets(id,version_id,format,page,filename) VALUES ($1,$2,$3,$4,$5)",
          [asset.id, id, asset.format, asset.page, asset.filename],
        );
      }
      await tx.query(
        "UPDATE versions SET generation_status='ready',generation_error=NULL WHERE id=$1",
        [id],
      );
    });
    return { ok: true as const };
  } catch (error) {
    console.error("PNG generation failed:", error);
    const message =
      error instanceof AppError
        ? error.message
        : "Não foi possível gerar as imagens. O menu está publicado. Tente gerar novamente em Publicações.";
    await database.query(
      "UPDATE versions SET generation_status='error',generation_error=$2 WHERE id=$1",
      [id, message],
    );
    return { ok: false as const, error: message };
  }
}
