import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import jsQR from "jsqr";
import JSZip from "jszip";
import type { StudioState } from "../../lib/types";

const email = "qa-demonstracao@example.invalid",
  password = "Apenas-demonstracao-12345";
const origin = "http://127.0.0.1:3100";
test("fotografia guardada no PostgreSQL fica acessível noutra sessão; ficheiros grandes e exportações privadas são protegidos", async ({
  page,
  browser,
}) => {
  await enter(page);
  const image = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#D4AF37" },
  })
    .png()
    .toBuffer();
  const upload = await page.request.post("/api/photos", {
    headers: { Origin: origin },
    multipart: {
      file: { name: "demonstracao.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(upload.status()).toBe(200);
  const { url } = await upload.json();
  expect(url).toMatch(/^\/api\/photos\/[a-f0-9-]+\.webp$/);
  const context = await browser.newContext({ baseURL: origin });
  try {
    const photo = await context.request.get(url);
    expect(photo.status()).toBe(200);
    expect((await sharp(await photo.body()).metadata()).format).toBe("webp");
    const state = (await (
      await page.request.get("/api/state")
    ).json()) as StudioState;
    if (state.todayPublication?.assets.length)
      expect(
        (
          await context.request.get(
            `/api/assets/${state.todayPublication.assets[0].id}`,
          )
        ).status(),
      ).toBe(401);
  } finally {
    await context.close();
  }
  const large = await page.request.post("/api/photos", {
    headers: { Origin: origin },
    multipart: {
      file: {
        name: "demonstracao-grande.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(3_000_001),
      },
    },
  });
  expect(large.status()).toBe(400);
  expect((await large.json()).error).toContain("3 MB");
});
async function enter(page: Page) {
  await page.goto("/studio");
  if (page.url().includes("/setup")) {
    await page
      .getByLabel("Nome", { exact: true })
      .fill("Administrador · Demonstração");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Palavra-passe", { exact: true }).fill(password);
    if (
      await page.getByLabel("Código de configuração", { exact: false }).count()
    )
      await page
        .getByLabel("Código de configuração", { exact: false })
        .fill("palace-local-qa-setup-token");
    await page.getByRole("button", { name: "Criar conta e começar" }).click();
  } else if (page.url().includes("/login")) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Palavra-passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no Studio" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Bem-vindo ao Palace Menu Studio" }),
  ).toBeVisible();
}
test("percurso obrigatório no browser: biblioteca, rascunho, prévia, publicação, PNG, QR e versões", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.screenshot({
    path: "test-results/menus/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Menus", exact: true }).click();
  await page
    .getByRole("link", { name: "Biblioteca de Pratos", exact: true })
    .click();
  await page.getByRole("button", { name: "Categorias", exact: true }).click();
  const catName = "Categoria de demonstração";
  await page.getByLabel("Nova categoria", { exact: true }).fill(catName);
  await page
    .getByRole("button", { name: "Criar categoria", exact: true })
    .click();
  await expect(
    page.getByText("Categoria guardada.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const names = [
    "DEMONSTRAÇÃO · Açúcar e limão",
    "DEMONSTRAÇÃO · Camarão à Luanda",
    "DEMONSTRAÇÃO · Prato de teste",
  ];
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Novo prato", exact: true }).click();
    await page.getByLabel("Nome do prato", { exact: true }).fill(names[i]);
    await page
      .getByRole("combobox", { name: "Categoria", exact: true })
      .selectOption({ label: catName });
    await page
      .getByLabel("Preço em Kz", { exact: true })
      .fill(String((i + 1) * 1500));
    await page
      .getByLabel("Descrição (opcional)", { exact: true })
      .fill("Dados fictícios de demonstração. Apenas para testes isolados.");
    await page
      .getByRole("button", { name: "Guardar prato", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.getByRole("link", { name: "Menu do Dia", exact: true }).click();
  await page
    .getByRole("button", { name: "Da biblioteca", exact: true })
    .click();
  for (const name of names)
    await page.getByRole("dialog").getByLabel(name, { exact: false }).check();
  await page
    .getByRole("button", { name: "Adicionar ao menu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar rascunho", exact: true })
    .click();
  await expect(
    page.getByText("Rascunho guardado.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(
    page.getByAltText("Pré-visualização feed, página 1"),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Story", exact: true }).click();
  await expect(
    page.getByAltText("Pré-visualização story, página 1"),
  ).toBeVisible({ timeout: 60000 });
  await page.screenshot({
    path: "test-results/menus/editor-desktop.png",
    fullPage: true,
  });
  const qrBefore = await (await page.request.get("/api/qr")).body();
  const decoded = await sharp(qrBefore)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(
    jsQR(
      new Uint8ClampedArray(decoded.data),
      decoded.info.width,
      decoded.info.height,
    )?.data,
  ).toBe(`${origin}/menu`);
  await page
    .getByRole("button", { name: "Publicar menu", exact: true })
    .click();
  await expect(
    page.getByText(
      "Menu publicado. Menu digital actualizado e imagens prontas para descarregar.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 60000 });
  const state = (await (
    await page.request.get("/api/state")
  ).json()) as StudioState;
  const first = state.todayPublication!;
  expect(first).toBeTruthy();
  const publicPage = await page.context().newPage();
  await publicPage.goto("/menu");
  for (const name of names)
    await expect(
      publicPage.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(
    publicPage.getByText("1 500 Kz", { exact: false }),
  ).toBeVisible();
  expect(await publicPage.locator(".sidebar").count()).toBe(0);
  await publicPage.screenshot({
    path: "test-results/menus/public-menu-desktop.png",
    fullPage: true,
  });
  for (const format of ["feed", "story"]) {
    const response = await page.request.get(
      `/api/exports/${first.id}/${format}`,
    );
    expect(response.status()).toBe(200);
    const metadata = await sharp(await response.body()).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(format === "feed" ? 1350 : 1920);
    expect(metadata.format).toBe("png");
  }
  const feed = first.assets.find((a) => a.format === "feed")!;
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Descarregar Feed", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^palace-menu-\d{4}-\d{2}-\d{2}-feed-01.png$/,
  );
  expect(await download.failure()).toBeNull();
  const price = page.getByRole("spinbutton", {
    name: `Preço de ${names[0]}`,
    exact: true,
  });
  await price.fill("9900");
  await page
    .getByRole("button", { name: "Guardar rascunho", exact: true })
    .click();
  await expect(
    page.getByText("Rascunho guardado.", { exact: false }),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByText("1 500 Kz", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publicar menu", exact: true })
    .click();
  await expect(
    page.getByText(
      "Menu publicado. Menu digital actualizado e imagens prontas para descarregar.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 60000 });
  await publicPage.reload();
  await expect(
    publicPage.getByText("9 900 Kz", { exact: false }),
  ).toBeVisible();
  const qrAfter = await (await page.request.get("/api/qr")).body();
  expect(qrAfter.equals(qrBefore)).toBe(true);
  const next = (await (
    await page.request.get("/api/state")
  ).json()) as StudioState;
  expect(next.todayPublication!.id).not.toBe(first.id);
  expect(
    next.publications
      .find((p) => p.id === first.id)!
      .items.find((i) => i.name === names[0])!.price,
  ).toBe(1500);
  const historic = await page.request.get(`/api/assets/${feed.id}`);
  expect(historic.status()).toBe(200);
  await page.getByRole("link", { name: "Publicações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Publicações", exact: true }),
  ).toBeVisible();
  const all = await page.request.get(
    `/api/exports/${next.todayPublication!.id}/all`,
  );
  expect(all.headers()["content-type"]).toContain("zip");
  expect(
    Object.keys((await JSZip.loadAsync(await all.body())).files).length,
  ).toBeGreaterThanOrEqual(2);
  await page.screenshot({
    path: "test-results/menus/publications-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("mobile: seis resoluções sem scroll horizontal e edição acessível", async ({
  page,
}) => {
  await enter(page);
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/studio",
      "/studio/biblioteca",
      "/studio/menu",
      "/studio/publicacoes",
      "/menu",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} em ${width}px`,
      ).toBe(true);
    }
    if (width === 390) {
      await page.screenshot({
        path: "test-results/menus/public-menu-mobile.png",
        fullPage: true,
      });
      await page.goto("/studio/menu");
      await page
        .getByRole("button", { name: "Pré-visualizar", exact: true })
        .click();
      await expect(page.locator(".preview-panel")).toBeVisible();
      await page.screenshot({
        path: "test-results/menus/editor-mobile.png",
        fullPage: true,
      });
    }
  }
});
test("segurança: acesso anónimo, origem externa, validação e menus vazios", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/state")).status()).toBe(401);
  expect((await request.get("/studio", { maxRedirects: 0 })).status()).toBe(
    307,
  );
  await enter(page);
  const state = (await (
    await page.request.get("/api/state")
  ).json()) as StudioState;
  const spoof = await page.request.post("/api/settings", {
    headers: { Origin: "https://example.invalid" },
    data: state.settings,
  });
  expect(spoof.status()).toBe(403);
  const empty = await page.request.post("/api/menu/publish", {
    headers: { Origin: origin },
    data: { date: state.today, revision: state.draft.revision, items: [] },
  });
  expect(empty.status()).toBe(400);
  const invalid = await page.request.post("/api/menu/save", {
    headers: { Origin: origin },
    data: {
      date: state.today,
      revision: state.draft.revision,
      items: [{ ...state.draft.items[0], price: -4 }],
    },
  });
  expect(invalid.status()).toBe(400);
  const future = await page.request.post("/api/menu/publish", {
    headers: { Origin: origin },
    data: { date: "2099-01-01", revision: 0, items: state.draft.items },
  });
  expect(future.status()).toBe(400);
  await page
    .getByRole("button", { name: /Administrador · Demonstração/ })
    .click();
  await page
    .getByRole("button", { name: "Terminar sessão", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});
