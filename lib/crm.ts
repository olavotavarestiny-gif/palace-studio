import { createHash, randomUUID } from "node:crypto";
import { db, one, type Connection } from "./db";
import { AppError } from "./validation";
import {
  calendarDate,
  customerInput,
  normalizePhone,
  privacyNotice,
  reservationInput,
  reservationPatch,
} from "./crm-validation";
import {
  statusTransitions,
  type Customer,
  type CustomerDetail,
  type CustomerList,
  type Reservation,
  type ReservationDetail,
  type ReservationList,
} from "./crm-types";
import { luandaDate } from "./format";
import { z } from "zod";

const reservationSelect = `SELECT r.id,r.customer_id,c.name AS customer_name,c.phone AS customer_phone,c.normalized_phone,c.vip,
 r.contact_name,r.contact_phone,r.contact_normalized_phone,r.contact_email,to_char(r.reservation_date,'YYYY-MM-DD') AS date,to_char(r.reservation_time,'HH24:MI') AS time,
 r.guests,r.occasion,r.customer_notes,r.internal_notes,r.status,r.source,r.revision,r.created_at,r.updated_at
 FROM reservations r JOIN customers c ON c.id=r.customer_id`;
const customerSelect = `SELECT c.id,c.name,c.phone,c.normalized_phone,c.email,to_char(c.birthday,'YYYY-MM-DD') AS birthday,c.vip,c.source,c.notes,c.revision,c.created_at,c.updated_at,
 (SELECT COUNT(*)::integer FROM reservations r WHERE r.customer_id=c.id) AS reservation_count,
 (SELECT COUNT(*)::integer FROM reservations r WHERE r.customer_id=c.id AND r.status='completed') AS completed_visits,
 (SELECT to_char(MAX(r.reservation_date+r.reservation_time),'YYYY-MM-DD"T"HH24:MI:SS') FROM reservations r WHERE r.customer_id=c.id) AS last_reservation
 FROM customers c`;

export async function audit(
  tx: Connection,
  type: "customer" | "reservation" | "privacy",
  id: string,
  action: string,
  actor: string | null,
  metadata: Record<string, unknown> = {},
) {
  // No telephone numbers, emails, names or note contents in the audit log.
  await tx.query(
    "INSERT INTO crm_audit(id,entity_type,entity_id,action,actor_id,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [randomUUID(), type, id, action, actor, JSON.stringify(metadata)],
  );
}
async function rateLimit(tx: Connection, key: string, max: number) {
  const hashed = createHash("sha256").update(key).digest("hex");
  const result = await one<{ hits: number }>(
    `INSERT INTO crm_rate_limits(key,hits,expires_at) VALUES ($1,1,NOW()+INTERVAL '10 minutes')
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN crm_rate_limits.expires_at<NOW() THEN 1 ELSE crm_rate_limits.hits+1 END,
    expires_at=CASE WHEN crm_rate_limits.expires_at<NOW() THEN NOW()+INTERVAL '10 minutes' ELSE crm_rate_limits.expires_at END RETURNING hits`,
    [hashed],
    tx,
  );
  if (result!.hits > max)
    throw new AppError(
      "Foram recebidos vários pedidos. Aguarde alguns minutos antes de tentar novamente.",
      429,
    );
}
export async function createReservation(
  raw: unknown,
  key: string,
  source: "website" | "manual",
  actor: string | null,
  clientKey = "global",
) {
  z.string().uuid("Identificador do pedido inválido.").parse(key);
  const input = reservationInput.parse(raw);
  const normalizedPhone = normalizePhone(input.phone)!;
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...input, phone: normalizedPhone }))
    .digest("hex");
  const requestKey = `${source}:${key}`;
  return (await db()).transaction(async (tx) => {
    const previous = await one<{ id: string; request_hash: string }>(
      "SELECT id,request_hash FROM reservations WHERE request_key=$1",
      [requestKey],
      tx,
    );
    if (previous) {
      if (previous.request_hash !== hash)
        throw new AppError(
          "Este pedido já foi usado com outros dados. Inicie um novo pedido.",
          409,
        );
      return { id: previous.id, duplicate: true };
    }
    if (source === "website") {
      if (!input.privacyAccepted)
        throw new AppError(
          "Autorize a utilização dos dados para tratar este pedido.",
        );
      if (
        new Date(`${input.date}T${input.time}:00+01:00`).getTime() <= Date.now()
      )
        throw new AppError(
          "Escolha uma data e um horário futuros, na hora de Luanda.",
        );
      await rateLimit(tx, `phone:${normalizedPhone}`, 6);
      await rateLimit(
        tx,
        `client:${clientKey}`,
        clientKey === "global" ? 120 : 20,
      );
      await rateLimit(tx, "website-total", 300);
    }
    const createdCustomer = await one<{ id: string }>(
      "INSERT INTO customers(id,name,phone,normalized_phone,email,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(normalized_phone) DO NOTHING RETURNING id",
      [
        randomUUID(),
        input.name,
        input.phone,
        normalizedPhone,
        input.email,
        source,
      ],
      tx,
    );
    const customer =
      createdCustomer ||
      (await one<{ id: string }>(
        "SELECT id FROM customers WHERE normalized_phone=$1",
        [normalizedPhone],
        tx,
      ));
    const id = randomUUID();
    const inserted = await one<{ id: string }>(
      `INSERT INTO reservations(id,customer_id,contact_name,contact_phone,contact_email,reservation_date,reservation_time,guests,occasion,customer_notes,source,request_key,request_hash,privacy_accepted_at,privacy_notice,contact_normalized_phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $14::boolean THEN NOW() ELSE NULL END,$15,$16) ON CONFLICT(request_key) DO NOTHING RETURNING id`,
      [
        id,
        customer!.id,
        input.name,
        input.phone,
        input.email,
        input.date,
        input.time,
        input.guests,
        input.occasion,
        input.notes,
        source,
        requestKey,
        hash,
        source === "website",
        source === "website" ? privacyNotice : null,
        normalizedPhone,
      ],
      tx,
    );
    if (!inserted) {
      const concurrent = await one<{ id: string; request_hash: string }>(
        "SELECT id,request_hash FROM reservations WHERE request_key=$1",
        [requestKey],
        tx,
      );
      if (concurrent!.request_hash !== hash)
        throw new AppError("Este pedido já foi usado com outros dados.", 409);
      return { id: concurrent!.id, duplicate: true };
    }
    if (createdCustomer)
      await audit(tx, "customer", customer!.id, "created", actor, { source });
    await audit(tx, "reservation", id, "created", actor, {
      source,
      status: "pending",
      customerId: customer!.id,
    });
    return { id, duplicate: false };
  });
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export async function listReservations(
  params: URLSearchParams,
): Promise<ReservationList> {
  const q = (params.get("q") || "").trim().slice(0, 120),
    status = params.get("status") || "",
    range = params.get("range") || "all";
  const page = Math.max(
    1,
    Math.min(100000, Math.trunc(Number(params.get("page")) || 1)),
  );
  const where: string[] = [],
    values: unknown[] = [];
  const bind = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (q) {
    const word = bind(`%${q}%`),
      digits = q.replace(/\D/g, "");
    const phone = bind(digits ? `%${digits}%` : "%!no-phone-match!%");
    where.push(
      `(r.contact_name ILIKE ${word} OR c.name ILIKE ${word} OR c.normalized_phone LIKE ${phone} OR r.contact_normalized_phone LIKE ${phone})`,
    );
  }
  if (status)
    where.push(
      `r.status=${bind(z.enum(["pending", "confirmed", "declined", "cancelled", "completed"]).parse(status))}`,
    );
  const today = luandaDate();
  if (range === "today") where.push(`r.reservation_date=${bind(today)}`);
  else if (range === "tomorrow")
    where.push(`r.reservation_date=${bind(addDays(today, 1))}`);
  else if (range === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const start = addDays(today, -((weekday + 6) % 7));
    where.push(
      `r.reservation_date BETWEEN ${bind(start)} AND ${bind(addDays(start, 6))}`,
    );
  } else if (range !== "all") throw new AppError("Filtro de datas inválido.");
  const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const database = await db();
  const total = await one<{ count: number }>(
    `SELECT COUNT(*)::integer AS count FROM reservations r JOIN customers c ON c.id=r.customer_id${filter}`,
    values,
  );
  const items = (
    await database.query<Reservation>(
      `${reservationSelect}${filter} ORDER BY r.created_at DESC,r.id DESC LIMIT 25 OFFSET ${bind((page - 1) * 25)}`,
      values,
    )
  ).rows;
  const stats = await one<ReservationList["stats"]>(
    `SELECT COUNT(*) FILTER(WHERE reservation_date=$1)::integer AS today,COUNT(*) FILTER(WHERE status='pending')::integer AS pending,COUNT(*) FILTER(WHERE status='confirmed')::integer AS confirmed,COUNT(*) FILTER(WHERE status='completed')::integer AS completed FROM reservations`,
    [today],
  );
  return { items, total: total!.count, page, stats: stats! };
}
export async function reservationDetail(
  id: string,
): Promise<ReservationDetail> {
  const reservation = await one<Reservation>(
    `${reservationSelect} WHERE r.id=$1`,
    [id],
  );
  if (!reservation) throw new AppError("Reserva não encontrada.", 404);
  const entries = (
    await (
      await db()
    ).query<ReservationDetail["audit"][number]>(
      "SELECT a.action,a.created_at,a.metadata,u.name AS actor_name FROM crm_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity_type=$1 AND a.entity_id=$2 ORDER BY a.created_at DESC LIMIT 30",
      ["reservation", id],
    )
  ).rows;
  return { reservation, audit: entries };
}
export async function updateReservation(
  id: string,
  raw: unknown,
  actor: string,
) {
  const input = reservationPatch.parse(raw);
  await (
    await db()
  ).transaction(async (tx) => {
    const row = await one<{
      revision: number;
      status: Reservation["status"];
      customer_id: string;
    }>(
      "SELECT revision,status,customer_id FROM reservations WHERE id=$1 FOR UPDATE",
      [id],
      tx,
    );
    if (!row) throw new AppError("Reserva não encontrada.", 404);
    if (row.revision !== input.revision)
      throw new AppError(
        "Esta reserva foi alterada por outra pessoa. Reabra os detalhes para ver a versão actual.",
        409,
      );
    if (
      input.status &&
      input.status !== row.status &&
      !statusTransitions[row.status].includes(input.status)
    )
      throw new AppError("Esta mudança de estado não é permitida.");
    if (
      input.customerId &&
      !(await one(
        "SELECT id FROM customers WHERE id=$1",
        [input.customerId],
        tx,
      ))
    )
      throw new AppError("Cliente não encontrado.");
    await tx.query(
      `UPDATE reservations SET reservation_date=COALESCE($1::date,reservation_date),reservation_time=COALESCE($2::time,reservation_time),guests=COALESCE($3,guests),internal_notes=COALESCE($4,internal_notes),status=COALESCE($5,status),customer_id=COALESCE($6,customer_id),revision=revision+1,updated_at=NOW() WHERE id=$7`,
      [
        input.date ?? null,
        input.time ?? null,
        input.guests ?? null,
        input.internalNotes ?? null,
        input.status ?? null,
        input.customerId ?? null,
        id,
      ],
    );
    await audit(tx, "reservation", id, "updated", actor, {
      fields: Object.keys(input).filter((k) => k !== "revision"),
      fromStatus: row.status,
      toStatus: input.status || row.status,
      fromCustomerId: row.customer_id,
      toCustomerId: input.customerId || row.customer_id,
    });
  });
  return reservationDetail(id);
}
export async function listCustomers(
  params: URLSearchParams,
): Promise<CustomerList> {
  const q = (params.get("q") || "").trim().slice(0, 120),
    page = Math.max(
      1,
      Math.min(100000, Math.trunc(Number(params.get("page")) || 1)),
    );
  const values: unknown[] = [],
    where: string[] = [];
  if (q) {
    values.push(
      `%${q}%`,
      q.replace(/\D/g, "") ? `%${q.replace(/\D/g, "")}%` : "%!no-phone-match!%",
    );
    where.push("(c.name ILIKE $1 OR c.normalized_phone LIKE $2)");
  }
  if (params.get("vip") === "1") where.push("c.vip=TRUE");
  const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const sort =
    params.get("sort") === "count"
      ? "reservation_count DESC,c.created_at DESC"
      : params.get("sort") === "name"
        ? "c.name ASC"
        : "last_reservation DESC NULLS LAST,c.created_at DESC";
  const count = await one<{ count: number }>(
    `SELECT COUNT(*)::integer AS count FROM customers c${filter}`,
    values,
  );
  values.push((page - 1) * 25);
  const items = (
    await (
      await db()
    ).query<Customer>(
      `${customerSelect}${filter} ORDER BY ${sort} LIMIT 25 OFFSET $${values.length}`,
      values,
    )
  ).rows;
  return { items, total: count!.count, page };
}
export async function customerDetail(id: string): Promise<CustomerDetail> {
  const customer = await one<Customer>(`${customerSelect} WHERE c.id=$1`, [id]);
  if (!customer) throw new AppError("Cliente não encontrado.", 404);
  const reservations = (
    await (
      await db()
    ).query<Reservation>(
      `${reservationSelect} WHERE r.customer_id=$1 ORDER BY r.reservation_date DESC,r.reservation_time DESC`,
      [id],
    )
  ).rows;
  return { customer, reservations };
}
export async function createCustomer(raw: unknown, actor: string) {
  const input = customerInput.parse(raw),
    id = randomUUID();
  await (
    await db()
  ).transaction(async (tx) => {
    const inserted = await one<{ id: string }>(
      "INSERT INTO customers(id,name,phone,normalized_phone,email,birthday,vip,source,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(normalized_phone) DO NOTHING RETURNING id",
      [
        id,
        input.name,
        input.phone,
        normalizePhone(input.phone),
        input.email,
        input.birthday,
        input.vip,
        "manual",
        input.notes,
      ],
      tx,
    );
    if (!inserted)
      throw new AppError(
        "Este telefone já pertence a um cliente. Procure o contacto existente.",
        409,
      );
    await audit(tx, "customer", id, "created", actor, { source: "manual" });
  });
  return customerDetail(id);
}
export async function updateCustomer(id: string, raw: unknown, actor: string) {
  const input = customerInput
    .extend({ revision: z.number().int().min(0) })
    .parse(raw);
  await (
    await db()
  ).transaction(async (tx) => {
    const row = await one<{ revision: number; vip: boolean }>(
      "SELECT revision,vip FROM customers WHERE id=$1 FOR UPDATE",
      [id],
      tx,
    );
    if (!row) throw new AppError("Cliente não encontrado.", 404);
    if (row.revision !== input.revision)
      throw new AppError(
        "Este cliente foi alterado por outra pessoa. Reabra o perfil para ver a versão actual.",
        409,
      );
    if (
      await one(
        "SELECT id FROM customers WHERE normalized_phone=$1 AND id<>$2",
        [normalizePhone(input.phone), id],
        tx,
      )
    )
      throw new AppError(
        "Este telefone já pertence a outro cliente. Corrija a associação na reserva, sem duplicar o contacto.",
        409,
      );
    await tx.query(
      "UPDATE customers SET name=$1,phone=$2,normalized_phone=$3,email=$4,birthday=$5,vip=$6,notes=$7,revision=revision+1,updated_at=NOW() WHERE id=$8",
      [
        input.name,
        input.phone,
        normalizePhone(input.phone),
        input.email,
        input.birthday,
        input.vip,
        input.notes,
        id,
      ],
    );
    await audit(tx, "customer", id, "updated", actor, {
      fields: ["name", "phone", "email", "birthday", "vip", "notes"],
      vipChanged: row.vip !== input.vip,
    });
  });
  return customerDetail(id);
}
