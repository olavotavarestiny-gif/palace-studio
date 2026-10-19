import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, one, dataDir } from "../lib/db";
import { firstAdmin, hashPassword, verifyPassword } from "../lib/auth";
import {
  saveMenu,
  currentPublication,
  getDraft,
  getPublication,
  previousMenu,
  publicUrl,
} from "../lib/menus";
import { renderMenu, generatePublication } from "../lib/render";
import { luandaDate } from "../lib/format";
import type { MenuItem } from "../lib/types";
import { readMedia, saveMedia } from "../lib/media";

let admin: string,
  cat: string,
  dishes: string[],
  items: MenuItem[],
  versionId: string;
before(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "palace-core-"));
  process.env.PUBLIC_URL = "http://localhost:3000";
  admin = await firstAdmin(
    "Administrador de demonstração",
    "teste@example.invalid",
    "Teste-apenas-12345",
  );
  cat = randomUUID();
  dishes = Array.from({ length: 3 }, () => randomUUID());
  await (
    await db()
  ).query("INSERT INTO categories(id,name) VALUES ($1,$2)", [
    cat,
    "Categoria de demonstração",
  ]);
  items = [];
  for (let i = 0; i < 3; i++) {
    const name = `Prato de demonstração ${i + 1} · Açúcar, camarão e limão`;
    await (
      await db()
    ).query(
      "INSERT INTO dishes(id,name,category_id,price) VALUES ($1,$2,$3,$4)",
      [dishes[i], name, cat, (i + 1) * 1500],
    );
    items.push({
      id: randomUUID(),
      dishId: dishes[i],
      categoryId: cat,
      categoryName: "Categoria de demonstração",
      name,
      description: "Dados fictícios, utilizados apenas em testes isolados.",
      price: (i + 1) * 1500,
      photo: null,
    });
  }
});
test("autenticação: hash protegido, palavra-passe errada e primeira conta única", async () => {
  const hash = await hashPassword("Palavra-passe-de-teste");
  assert.ok(!hash.includes("Palavra-passe-de-teste"));
  assert.ok(await verifyPassword("Palavra-passe-de-teste", hash));
  assert.equal(await verifyPassword("outra", hash), false);
  await assert.rejects(
    firstAdmin("Outra", "outra@example.invalid", "Teste-apenas-12345"),
    /já foi criada/,
  );
});
test("data de Luanda considera a meia-noite local", () => {
  assert.equal(luandaDate(new Date("2026-10-19T23:30:00Z")), "2026-10-20");
  assert.equal(luandaDate(new Date("2026-10-19T22:59:59Z")), "2026-10-19");
});
test("fluxo completo: rascunho, publicação, PNG, alteração isolada, republicação e histórico", async () => {
  const today = luandaDate();
  const qrBefore = publicUrl();
  assert.equal(await currentPublication(), null);
  const draft = await saveMenu({ date: today, revision: 0, items });
  assert.equal((await getDraft(today)).items.length, 3);
  assert.equal(await currentPublication(), null);
  const preview = await renderMenu(items, today, "feed");
  assert.ok(preview.length);
  const publish = await saveMenu(
    { date: today, revision: draft.draft.revision, items },
    admin,
  );
  versionId = publish.versionId!;
  assert.equal((await currentPublication())!.items[0].price, 1500);
  assert.ok((await generatePublication(versionId)).ok);
  const pub = (await getPublication(versionId))!;
  for (const format of ["feed", "story"]) {
    const asset = pub.assets.find((a) => a.format === format)!;
    const image = await readFile(
      path.join(dataDir(), "exports", asset.filename),
    );
    const meta = await sharp(image).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, format === "feed" ? 1350 : 1920);
  }
  const changed = items.map((i, index) => ({
    ...i,
    price: index ? i.price : 9900,
  }));
  const saved = await saveMenu({
    date: today,
    revision: publish.draft.revision,
    items: changed,
  });
  assert.equal((await currentPublication())!.items[0].price, 1500);
  await saveMenu(
    { date: today, revision: saved.draft.revision, items: changed },
    admin,
  );
  assert.equal((await currentPublication())!.items[0].price, 9900);
  assert.equal((await getPublication(versionId))!.items[0].price, 1500);
  assert.equal(publicUrl(), qrBefore);
  assert.equal(
    Number(
      (await one<{ price: number }>("SELECT price FROM dishes WHERE id=$1", [
        dishes[0],
      ]))!.price,
    ),
    1500,
  );
});
test("menus vazios, preços inválidos, conflitos e datas futuras são rejeitados", async () => {
  const today = luandaDate(),
    draft = await getDraft(today);
  await assert.rejects(
    saveMenu({ date: today, revision: draft.revision, items: [] }, admin),
    /pelo menos/,
  );
  await assert.rejects(
    saveMenu(
      {
        date: today,
        revision: draft.revision,
        items: [{ ...items[0], price: -1 }],
      },
      admin,
    ),
  );
  await assert.rejects(
    saveMenu({ date: today, revision: 0, items }, admin),
    /noutra janela/,
  );
  await assert.rejects(saveMenu({ date: "2026-02-31", revision: 0, items }));
  await assert.rejects(
    saveMenu({ date: "2099-01-01", revision: 0, items }, admin),
    /data actual/,
  );
  await saveMenu({ date: "2099-01-01", revision: 0, items });
  assert.equal((await getDraft("2099-01-01")).published_id, null);
});
test("muitos pratos e categorias geram várias páginas PNG com nomes e preços longos", async () => {
  const many = Array.from({ length: 35 }, (_, i) => ({
    ...items[0],
    id: randomUUID(),
    categoryId: `category-${Math.floor(i / 5)}`,
    categoryName: `Categoria de demonstração ${Math.floor(i / 5)}`,
    name: `Demonstração ${i} · ${"Camarão à moda de Luanda com açafrão e limão ".repeat(2)}`,
    description:
      "Descrição com caracteres portugueses: á, é, í, ó, ú, ã, õ, ç.",
    price: 999999999.99,
  }));
  for (const format of ["feed", "story"] as const) {
    const pages = await renderMenu(many, luandaDate(), format);
    assert.ok(pages.length > 1);
    for (const page of pages) {
      const m = await sharp(page).metadata();
      assert.equal(m.width, 1080);
      assert.equal(m.height, format === "feed" ? 1350 : 1920);
    }
  }
});
test("falha de geração preserva o menu e permite repetir a exportação", async () => {
  const result = await generatePublication(versionId, async () => {
    throw new Error("Falha de renderização simulada para teste");
  });
  assert.equal(result.ok, false);
  assert.equal((await getPublication(versionId))!.generation_status, "error");
  assert.ok(await currentPublication());
  assert.ok((await generatePublication(versionId)).ok);
});
test("duplicação usa uma cópia e a ausência de publicação não apresenta o menu anterior", async () => {
  const tomorrow = "2099-01-02";
  assert.equal(await currentPublication(tomorrow), null);
  const duplicated = await previousMenu(tomorrow);
  assert.equal(duplicated.length, 3);
  assert.notEqual(duplicated[0].id, items[0].id);
});

test("Vercel: fotografias e PNG persistem no PostgreSQL sem filesystem gravável", async () => {
  const previous = { vercel: process.env.VERCEL, data: process.env.DATA_DIR };
  process.env.VERCEL = "1";
  process.env.DATA_DIR = "/dev/null/palace-readonly";
  try {
    assert.ok((await generatePublication(versionId)).ok);
    const publication = (await getPublication(versionId))!;
    assert.ok(publication.assets.length >= 2);
    for (const asset of publication.assets) {
      const image = await readMedia("export", asset.filename);
      const meta = await sharp(image).metadata();
      assert.equal(meta.format, "png");
      assert.equal(meta.width, 1080);
      assert.equal(meta.height, asset.format === "feed" ? 1350 : 1920);
    }
    const photo = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#D4AF37" },
    })
      .webp()
      .toBuffer();
    const filename = `${randomUUID()}.webp`;
    await saveMedia("photo", filename, photo);
    assert.deepEqual(await readMedia("photo", filename), photo);
    await assert.rejects(
      saveMedia("photo", filename, Buffer.from("other")),
      /imagem diferente/,
    );
    assert.deepEqual(await readMedia("photo", filename), photo);
    await assert.rejects(readMedia("photo", "../private.webp"), /inválido/);
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    process.env.DATA_DIR = previous.data;
  }
});
