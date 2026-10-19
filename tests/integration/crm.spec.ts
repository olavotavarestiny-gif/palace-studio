import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { luandaDate } from "../../lib/format";
import { addDays } from "../../lib/crm";
const website = "http://127.0.0.1:3201",
  studio = "http://127.0.0.1:3200";
const email = "crm-qa@example.invalid",
  password = "CRM-apenas-teste-12345";
const name = "Visitante de demonstração CRM";
async function login(page: Page) {
  await page.goto("/studio");
  if (page.url().includes("/setup")) {
    await page
      .getByLabel("Nome", { exact: true })
      .fill("Administrador de demonstração CRM");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Palavra-passe", { exact: true }).fill(password);
    await page
      .getByLabel("Código de configuração", { exact: false })
      .fill("palace-crm-qa-setup");
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
async function openWebsiteForm(
  page: Page,
  phone: string,
  visitor = name,
  offset = 1,
) {
  await page.goto(website);
  const reserve = page
    .getByRole("button", { name: "Reservar mesa", exact: true })
    .first();
  if (await reserve.count()) await reserve.click();
  else {
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Navegação", exact: true })
      .getByRole("button", { name: "Reservar mesa", exact: true })
      .click();
  }
  const form = page.getByRole("dialog", { name: "O próximo momento." });
  await expect(form).toBeVisible();
  await form.getByLabel("O seu nome").fill(visitor);
  await form.getByLabel("Número de contacto").fill(phone);
  await form
    .getByLabel("Email", { exact: false })
    .fill("visitante@example.invalid");
  await form.locator("[name=date]").fill(addDays(luandaDate(), offset));
  await form.getByLabel("Horário pretendido").fill("20:00");
  await form.getByLabel("Número de pessoas").fill("4");
  await form.getByLabel("Ocasião", { exact: false }).selectOption("Celebração");
  await form
    .getByLabel("Algum detalhe especial?", { exact: false })
    .fill("Observações de demonstração: atenção aos caracteres á, ã e ç.");
  await form.getByRole("checkbox").check();
  return form;
}
test("website → pedido pendente → confirmação → cliente recorrente → reserva manual → visita concluída", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("link", { name: "Reservas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reservas", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({ reducedMotion: "reduce" }),
    visitor = await context.newPage();
  try {
    let form = await openWebsiteForm(visitor, "923600001");
    const responsePromise = visitor.waitForResponse(
      (r) =>
        r.url().endsWith("/api/reservations") &&
        r.request().method() === "POST",
    );
    await form
      .getByRole("button", { name: "Solicitar Reserva", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    expect(Object.keys(receipt).sort()).toEqual(["received", "reference"]);
    await expect(
      form.getByRole("heading", { name: "Pedido de reserva recebido!" }),
    ).toBeVisible();
    await expect(form.getByRole("status")).toContainText(
      "A mesa ainda não está confirmada.",
    );
    await expect(
      page.locator(".crm-reservation-row").filter({ hasText: name }),
    ).toBeVisible({ timeout: 25000 }); // Existing open screen updates by polling.
    await page
      .locator(".crm-reservation-row")
      .filter({ hasText: name })
      .click();
    let dialog = page.getByRole("dialog", { name: "Detalhes da reserva" });
    await expect(dialog.locator(".crm-status")).toHaveText("Pendente");
    await expect(dialog.locator("[name=date]")).toHaveValue(
      addDays(luandaDate(), 1),
    );
    await expect(dialog.locator("[name=time]")).toHaveValue("20:00");
    await expect(dialog.locator("[name=guests]")).toHaveValue("4");
    await expect(dialog).toContainText("atenção aos caracteres á, ã e ç.");
    await dialog
      .getByRole("button", { name: "Confirmar reserva", exact: true })
      .click();
    await expect(dialog.locator(".crm-status")).toHaveText("Confirmada");
    await page.screenshot({
      path: "test-results/crm/crm-reservation-desktop.png",
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: `Perfil: ${name}`, exact: false })
      .click();
    let profile = page.getByRole("dialog", { name: "Perfil do cliente" });
    await expect(
      profile.locator(".crm-customer-metrics>div").first(),
    ).toContainText("1");
    await expect(profile.locator(".customer-history-row")).toHaveCount(1);
    await expect(profile).toContainText("Confirmada");
    await profile
      .getByRole("button", { name: "Editar dados e identificação VIP" })
      .click();
    await profile
      .getByRole("checkbox", {
        name: "Identificar como cliente VIP",
        exact: false,
      })
      .check();
    await profile
      .getByLabel("Observações internas", { exact: true })
      .fill("Preferência autorizada de demonstração.");
    await profile
      .getByRole("button", { name: "Guardar dados do cliente" })
      .click();
    await expect(
      profile.getByText("Cliente VIP", { exact: true }),
    ).toBeVisible();
    await profile.getByRole("button", { name: "Fechar", exact: true }).click();
    form = await openWebsiteForm(visitor, "+244 923 600 001", name, 2);
    await form
      .getByRole("button", { name: "Solicitar Reserva", exact: true })
      .click();
    await expect(
      form.getByRole("heading", { name: "Pedido de reserva recebido!" }),
    ).toBeVisible();
    const customers = await (
      await page.request.get("/api/crm/customers?q=923600001")
    ).json();
    expect(customers.items).toHaveLength(1);
    expect(customers.items[0].reservation_count).toBe(2);
    expect(customers.items[0].vip).toBe(true);
    expect(customers.items[0].notes).toBe(
      "Preferência autorizada de demonstração.",
    );
    await page
      .getByRole("button", { name: "Nova reserva", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Uma nova reserva." });
    await dialog.getByLabel("Nome completo", { exact: true }).fill(name);
    await dialog
      .getByLabel("Telefone", { exact: true })
      .fill("00244 923600001");
    await dialog.getByLabel("Data da reserva").fill(luandaDate());
    await dialog.getByLabel("Hora de Luanda").fill("09:00");
    await dialog.getByLabel("Número de pessoas").fill("2");
    await dialog
      .getByLabel("Observações do pedido", { exact: false })
      .fill("Recebida por telefone, apenas demonstração.");
    await dialog
      .getByRole("button", { name: "Criar reserva", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Detalhes da reserva" });
    await expect(dialog).toContainText("Recebida por telefone");
    await dialog
      .getByRole("button", { name: "Confirmar reserva", exact: true })
      .click();
    await expect(dialog.locator(".crm-status")).toHaveText("Confirmada");
    await dialog.getByRole("button", { name: "Marcar como concluída" }).click();
    await expect(dialog.locator(".crm-status")).toHaveText("Concluída");
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Procurar por nome ou telefone" })
      .fill("923600001");
    await page.locator(".crm-customer-row").filter({ hasText: name }).click();
    profile = page.getByRole("dialog", { name: "Perfil do cliente" });
    await expect(
      profile.locator(".crm-customer-metrics>div").nth(0),
    ).toHaveText(/3\s*Total de reservas/);
    await expect(
      profile.locator(".crm-customer-metrics>div").nth(1),
    ).toHaveText(/1\s*Visitas concluídas/);
    await expect(profile.locator(".customer-history-row")).toHaveCount(3);
    await page.screenshot({
      path: "test-results/crm/crm-customer-profile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("repetição de rede mantém uma única reserva e os endpoints privados não expõem contactos", async ({
  page,
  request,
}) => {
  await login(page);
  expect((await request.get(`${studio}/api/crm/customers`)).status()).toBe(401);
  expect((await request.get(`${studio}/api/crm/reservations`)).status()).toBe(
    401,
  );
  expect(
    (
      await request.post(`${studio}/api/integrations/reservations`, {
        data: {},
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).status(),
  ).toBe(401);
  const data = {
      kind: "reservation",
      name: "Demonstração de idempotência",
      phone: "923600002",
      date: addDays(luandaDate(), 1),
      time: "21:00",
      guests: "3",
      consent: true,
    },
    key = randomUUID(),
    headers = { Origin: website, "Idempotency-Key": key };
  const replies = await Promise.all([
    request.post(`${website}/api/reservations`, { headers, data }),
    request.post(`${website}/api/reservations`, { headers, data }),
  ]);
  const receipts = await Promise.all(replies.map((r) => r.json()));
  expect(receipts[0].reference).toBe(receipts[1].reference);
  expect(replies.map((r) => r.status()).sort()).toEqual([200, 201]);
  const list = await (
    await page.request.get("/api/crm/customers?q=923600002")
  ).json();
  expect(list.items).toHaveLength(1);
  expect(list.items[0].reservation_count).toBe(1);
  expect(
    (
      await request.post(`${website}/api/reservations`, {
        headers,
        data: { ...data, guests: "5" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(`${website}/api/reservations`, {
        headers: { ...headers, Origin: "https://example.invalid" },
        data,
      })
    ).status(),
  ).toBe(403);
  for (const invalid of [
    { ...data, name: "" },
    { ...data, phone: "123" },
    { ...data, date: "2026-02-31" },
    { ...data, time: "25:00" },
    { ...data, guests: "1.5" },
    { ...data, consent: false },
    { ...data, website: "spam.invalid" },
  ])
    expect(
      (
        await request.post(`${website}/api/reservations`, {
          headers: { Origin: website, "Idempotency-Key": randomUUID() },
          data: invalid,
        })
      ).status(),
    ).toBe(400);
  const menu = await (await request.get(`${studio}/api/published-menu`)).json();
  expect(menu).not.toHaveProperty("customers");
  expect(menu).not.toHaveProperty("reservations");
});

test("perda da resposta depois da gravação mostra erro, preserva campos e permite repetir sem duplicar", async ({
  page,
  browser,
}) => {
  await login(page);
  const context = await browser.newContext({ reducedMotion: "reduce" }),
    visitor = await context.newPage();
  try {
    let lost = true,
      reference = "";
    await visitor.route("**/api/reservations", async (route) => {
      if (lost) {
        lost = false;
        const response = await route.fetch();
        reference = (await response.json()).reference;
        await route.abort("failed");
      } else await route.continue();
    });
    const form = await openWebsiteForm(
      visitor,
      "923600003",
      "Demonstração de falha de rede",
    );
    await form.getByRole("button", { name: "Solicitar Reserva" }).click();
    await expect(form.getByRole("alert")).toContainText("Sem ligação.");
    await expect(form.locator("[name=name]")).toHaveValue(
      "Demonstração de falha de rede",
    );
    await expect(
      form.getByRole("heading", { name: "Pedido de reserva recebido!" }),
    ).toHaveCount(0);
    await form.getByRole("button", { name: "Solicitar Reserva" }).click();
    await expect(
      form.getByRole("heading", { name: "Pedido de reserva recebido!" }),
    ).toBeVisible();
    const customer = (
      await (await page.request.get("/api/crm/customers?q=923600003")).json()
    ).items[0];
    expect(customer.reservation_count).toBe(1);
    const profile = await (
      await page.request.get(`/api/crm/customers/${customer.id}`)
    ).json();
    expect(profile.reservations[0].id).toBe(reference);
  } finally {
    await context.close();
  }
});

test("filtros, pesquisa, registo manual de cliente, VIP e correcção da associação funcionam no Studio", async ({
  page,
}) => {
  await login(page);
  await page.goto("/studio/clientes");
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Um novo contacto." });
  await dialog
    .getByLabel("Nome completo", { exact: true })
    .fill("Contacto manual de demonstração");
  await dialog.getByLabel("Telefone", { exact: true }).fill("+244 923 600 004");
  await dialog
    .getByLabel("Email", { exact: false })
    .fill("manual@example.invalid");
  await dialog.getByLabel("Aniversário", { exact: false }).fill("1991-03-09");
  await dialog
    .getByRole("button", { name: "Criar cliente", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Perfil do cliente" });
  await expect(dialog).toContainText("Registo manual");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.goto("/studio/reservas");
  await page.getByRole("button", { name: "Amanhã", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filtrar reservas por estado" })
    .selectOption("pending");
  await page
    .getByRole("searchbox", { name: "Procurar por nome ou telefone" })
    .fill("923600002");
  await expect(page.locator(".crm-reservation-row")).toHaveCount(1);
  await page.locator(".crm-reservation-row").click();
  dialog = page.getByRole("dialog", { name: "Detalhes da reserva" });
  await dialog
    .getByRole("button", { name: "Corrigir associação ao cliente" })
    .click();
  await dialog
    .getByRole("searchbox", { name: "Procurar cliente" })
    .fill("923600004");
  await expect(
    dialog
      .getByRole("combobox", { name: "Cliente associado" })
      .getByRole("option", { name: /Contacto manual de demonstração/ }),
  ).toHaveCount(1);
  await dialog
    .getByRole("combobox", { name: "Cliente associado" })
    .selectOption({
      label: "Contacto manual de demonstração · +244 923 600 004",
    });
  await dialog
    .getByRole("button", { name: "Guardar alterações", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Perfil: Contacto manual de demonstração",
      exact: false,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Recusar pedido" }).click();
  await expect(dialog.locator(".crm-status")).toHaveText("Recusada");
  await dialog
    .getByRole("button", {
      name: "Perfil: Contacto manual de demonstração",
      exact: false,
    })
    .click();
  dialog = page.getByRole("dialog", { name: "Perfil do cliente" });
  await expect(dialog.locator(".customer-history-row")).toHaveCount(1);
});

test("CRM e formulário mantêm todos os dados acessíveis nas seis larguras pedidas", async ({
  page,
  browser,
}) => {
  await login(page);
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/studio/reservas", "/studio/clientes"]) {
      await page.goto(route);
      await expect(page.locator(".crm-list")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route}: ${width}px`,
      ).toBe(true);
    }
    if (width === 390) {
      await page.screenshot({
        path: "test-results/crm/crm-customers-mobile.png",
        fullPage: true,
      });
      await page.goto("/studio/reservas");
      await page.screenshot({
        path: "test-results/crm/crm-reservations-mobile.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Nova reserva", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Uma nova reserva." });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    }
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const visitor = await context.newPage();
    const form = await openWebsiteForm(visitor, "923600005");
    await expect(
      form.getByRole("button", { name: "Solicitar Reserva" }),
    ).toBeVisible();
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await visitor.screenshot({
      path: "test-results/crm/crm-website-form-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
