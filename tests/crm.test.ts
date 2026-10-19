import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, one } from "../lib/db";
import { firstAdmin } from "../lib/auth";
import { cleanupCrm } from "../lib/crm-retention";
import {
  addDays,
  createCustomer,
  createReservation,
  customerDetail,
  listCustomers,
  listReservations,
  reservationDetail,
  updateCustomer,
  updateReservation,
} from "../lib/crm";
import { normalizePhone } from "../lib/crm-validation";
import { luandaDate } from "../lib/format";
import {
  reservationSignature,
  verifyReservationSignature,
} from "../lib/reservation-signature";
let admin: string, first: string, customerId: string;
const phone = "+244 923 456 789";
const payload = () => ({
  name: "Cliente de demonstração",
  phone,
  email: "qa@example.invalid",
  date: addDays(luandaDate(), 1),
  time: "20:00",
  guests: 4,
  occasion: "Celebração",
  notes: "Observação de demonstração",
  privacyAccepted: true,
});
before(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "palace-crm-"));
  admin = await firstAdmin(
    "Administrador de teste",
    "admin@example.invalid",
    "Apenas-testes-12345",
  );
});
test("normaliza telefones angolanos com +244, 00244, 244 ou nove dígitos e rejeita números inválidos", () => {
  for (const number of [
    "923456789",
    "+244 923 456 789",
    "00244 923-456-789",
    "244923456789",
  ])
    assert.equal(normalizePhone(number), "+244923456789");
  for (const number of ["123", "+244123", "telefone923456789", "++++923456789"])
    assert.equal(normalizePhone(number), null);
  assert.equal(normalizePhone("+351 912 345 678"), "+351912345678");
});
test("pedido público cria cliente e reserva pendente, preservando dados enviados e a ausência de marketing", async () => {
  const result = await createReservation(
    payload(),
    randomUUID(),
    "website",
    null,
  );
  first = result.id;
  const detail = await reservationDetail(first);
  customerId = detail.reservation.customer_id;
  assert.equal(detail.reservation.status, "pending");
  assert.equal(detail.reservation.guests, 4);
  assert.equal(detail.reservation.customer_notes, payload().notes);
  const customer = (await customerDetail(customerId)).customer;
  assert.equal(customer.normalized_phone, "+244923456789");
  assert.equal(customer.source, "website");
  assert.equal(customer.reservation_count, 1);
  assert.equal(customer.completed_visits, 0);
  const stored = await one<{
    marketing_consent: boolean;
    privacy_notice: string;
    privacy_accepted_at: unknown;
  }>(
    "SELECT c.marketing_consent,r.privacy_notice,r.privacy_accepted_at FROM reservations r JOIN customers c ON c.id=r.customer_id WHERE r.id=$1",
    [first],
  );
  assert.equal(stored!.marketing_consent, false);
  assert.ok(stored!.privacy_accepted_at);
  assert.match(stored!.privacy_notice, /não autorizam marketing/);
});
test("telefone recorrente encontra o mesmo perfil, sem alterar VIP, notas ou nome definidos pela equipa", async () => {
  const original = (await customerDetail(customerId)).customer;
  await updateCustomer(
    customerId,
    {
      name: "Nome definido pela equipa",
      phone: original.phone,
      email: original.email,
      birthday: "1990-02-18",
      vip: true,
      notes: "Preferência autorizada",
      revision: original.revision,
    },
    admin,
  );
  const result = await createReservation(
    { ...payload(), name: "Outro nome enviado no pedido", phone: "923456789" },
    randomUUID(),
    "website",
    null,
  );
  assert.equal(
    (await reservationDetail(result.id)).reservation.customer_id,
    customerId,
  );
  const current = (await customerDetail(customerId)).customer;
  assert.equal(current.reservation_count, 2);
  assert.equal(current.name, "Nome definido pela equipa");
  assert.equal(current.vip, true);
  assert.equal(current.notes, "Preferência autorizada");
});
test("repetições e envios concorrentes com a mesma chave geram uma única reserva", async () => {
  const key = randomUUID(),
    data = { ...payload(), phone: "+244 924 111 222" };
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      createReservation(data, key, "website", null),
    ),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  const count = await one<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM reservations WHERE request_key=$1",
    [`website:${key}`],
  );
  assert.equal(count!.count, 1);
  await assert.rejects(
    createReservation({ ...data, guests: 5 }, key, "website", null),
    /outros dados/,
  );
});
test("confirmação, conclusão e histórico distinguem reservas de visitas efectivamente concluídas", async () => {
  let detail = await reservationDetail(first);
  detail = await updateReservation(
    first,
    {
      revision: detail.reservation.revision,
      status: "confirmed",
      internalNotes: "Atendimento autorizado",
    },
    admin,
  );
  detail = await updateReservation(
    first,
    { revision: detail.reservation.revision, status: "completed" },
    admin,
  );
  assert.equal(detail.reservation.status, "completed");
  assert.equal((await customerDetail(customerId)).customer.completed_visits, 1);
  await assert.rejects(
    updateReservation(
      first,
      { revision: detail.reservation.revision, status: "pending" },
      admin,
    ),
    /não é permitida/,
  );
  await assert.rejects(
    updateReservation(first, { revision: 0, internalNotes: "Conflito" }, admin),
    /outra pessoa/,
  );
  const audit = JSON.stringify(detail.audit.map((entry) => entry.metadata));
  assert.ok(!audit.includes("923456789"));
  assert.ok(!audit.includes("Atendimento autorizado"));
});
test("reservas manuais, pesquisas, filtros, clientes separados pelo telefone e correcção de associação", async () => {
  const created = await createCustomer(
    {
      name: "Nome definido pela equipa",
      phone: "+244 925 222 333",
      email: "",
      notes: "",
    },
    admin,
  );
  const otherId = created.customer.id;
  assert.notEqual(otherId, customerId);
  await assert.rejects(
    createCustomer({ name: "Duplicado", phone: "925222333" }, admin),
    /já pertence/,
  );
  const manual = await createReservation(
    { ...payload(), phone: "925222333", date: luandaDate() },
    randomUUID(),
    "manual",
    admin,
  );
  let detail = await reservationDetail(manual.id);
  assert.equal(detail.reservation.customer_id, otherId);
  detail = await updateReservation(
    manual.id,
    { revision: detail.reservation.revision, customerId },
    admin,
  );
  assert.equal(detail.reservation.customer_id, customerId);
  assert.equal((await customerDetail(otherId)).customer.reservation_count, 0);
  assert.equal(
    (
      await listReservations(new URLSearchParams({ q: "925222333" }))
    ).items.some((r) => r.id === manual.id),
    true,
  );
  assert.ok(
    (
      await listReservations(
        new URLSearchParams({ range: "today", status: "pending" }),
      )
    ).items.some((r) => r.id === manual.id),
  );
  assert.ok(
    (
      await listCustomers(
        new URLSearchParams({ q: "923456789", sort: "count", vip: "1" }),
      )
    ).items.some((c) => c.id === customerId),
  );
  await assert.rejects(
    updateCustomer(
      otherId,
      { ...created.customer, phone, revision: created.customer.revision },
      admin,
    ),
    /outro cliente/,
  );
});
test("rejeita campos inválidos, datas inexistentes ou passadas e consentimento ausente sem criar registos", async () => {
  const before = (await one<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM reservations",
  ))!.count;
  for (const input of [
    { ...payload(), name: "" },
    { ...payload(), phone: "123" },
    { ...payload(), date: "2026-02-31" },
    { ...payload(), time: "25:61" },
    { ...payload(), guests: 0 },
    { ...payload(), guests: 1.5 },
    { ...payload(), privacyAccepted: false },
    { ...payload(), date: addDays(luandaDate(), -1) },
  ])
    await assert.rejects(
      createReservation(input, randomUUID(), "website", null),
    );
  assert.equal(
    (await one<{ count: number }>(
      "SELECT COUNT(*)::integer AS count FROM reservations",
    ))!.count,
    before,
  );
});
test("limitação de abuso é persistente e bloqueia novos pedidos excessivos", async () => {
  const data = { ...payload(), phone: "+244 926 111 444" };
  for (let i = 0; i < 6; i++)
    await createReservation(
      { ...data, time: `${10 + i}:00` },
      randomUUID(),
      "website",
      null,
    );
  await assert.rejects(
    createReservation(data, randomUUID(), "website", null),
    /vários pedidos/,
  );
});
test("assinatura exige segredo, corpo, chave de idempotência e timestamp válidos", () => {
  const secret = "segredo-de-demonstracao-apenas-para-testes-12345",
    timestamp = String(Math.floor(Date.now() / 1000)),
    key = randomUUID(),
    body = JSON.stringify(payload());
  const headers = {
    "x-palace-timestamp": timestamp,
    "x-palace-client": "global",
    "idempotency-key": key,
    "x-palace-signature": reservationSignature(
      secret,
      timestamp,
      "global",
      key,
      body,
    ),
  };
  const request = new Request(
    "http://127.0.0.1/api/integrations/reservations",
    { headers },
  );
  assert.equal(verifyReservationSignature(request, body, secret).key, key);
  assert.throws(
    () => verifyReservationSignature(request, body + " ", secret),
    /não autorizado/,
  );
  assert.throws(
    () =>
      verifyReservationSignature(request, body, secret, Date.now() + 600000),
    /não autorizado/,
  );
  assert.throws(
    () => verifyReservationSignature(request, body, ""),
    /não está configurado/,
  );
  assert.throws(
    () =>
      verifyReservationSignature(
        new Request(request, {
          headers: { ...headers, "idempotency-key": randomUUID() },
        }),
        body,
        secret,
      ),
    /não autorizado/,
  );
});

test("retenção começa em pré-visualização e preserva contactos com reservas futuras", async () => {
  const old = await createCustomer(
    {
      name: "Contacto antigo de demonstração",
      phone: "923700001",
      notes: "Nota antiga",
    },
    admin,
  );
  const recent = await createCustomer(
    { name: "Contacto com visita futura", phone: "923700002" },
    admin,
  );
  const oldReservation = await createReservation(
    {
      ...payload(),
      name: old.customer.name,
      phone: "923700001",
      date: "2020-01-01",
    },
    randomUUID(),
    "manual",
    admin,
  );
  await createReservation(
    { ...payload(), phone: "923700002" },
    randomUUID(),
    "manual",
    admin,
  );
  await (
    await db()
  ).query(
    "UPDATE customers SET created_at=NOW()-INTERVAL '36 months',updated_at=NOW()-INTERVAL '36 months' WHERE id IN ($1,$2)",
    [old.customer.id, recent.customer.id],
  );
  await (
    await db()
  ).query(
    "UPDATE reservations SET created_at=NOW()-INTERVAL '36 months',updated_at=NOW()-INTERVAL '36 months' WHERE id=$1",
    [oldReservation.id],
  );
  const preview = await cleanupCrm(false, 24);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.customers, 1);
  assert.ok(await customerDetail(old.customer.id));
  const applied = await cleanupCrm(true, 24);
  assert.equal(applied.customers, 1);
  assert.equal(applied.reservations, 1);
  assert.equal(
    await one("SELECT id FROM customers WHERE id=$1", [old.customer.id]),
    null,
  );
  assert.ok(await customerDetail(recent.customer.id));
});
