import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { luandaDate } from "./format";

export function normalizePhone(input: string) {
  if (!/^[+\d\s().-]+$/.test(input)) return null;
  let value = input.trim().replace(/[\s().-]/g, "");
  if (value.startsWith("00")) value = "+" + value.slice(2);
  if (/^244\d{9}$/.test(value)) value = "+" + value;
  const phone = parsePhoneNumberFromString(value, "AO");
  return phone?.isValid() ? phone.number.toString() : null;
}
export const crmName = z
  .string()
  .trim()
  .min(2, "Indique o nome completo.")
  .max(120);
export const crmPhone = z
  .string()
  .trim()
  .min(1, "Indique o telefone.")
  .max(50)
  .refine(
    (s) => !!normalizePhone(s),
    "Telefone inválido. Para Angola, utilize nove dígitos ou +244 seguido do número.",
  );
export const crmEmail = z
  .union([z.literal(""), z.email().max(254), z.null()])
  .optional()
  .transform((v) => (v ? v.trim().toLowerCase() : null));
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((s) => {
    const date = new Date(`${s}T12:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === s &&
      s >= "1900-01-01" &&
      s <= "2199-12-31"
    );
  }, "Data inválida.");
export const reservationTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");
export const customerInput = z.object({
  name: crmName,
  phone: crmPhone,
  email: crmEmail,
  birthday: z
    .union([calendarDate, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => !v || v <= luandaDate(),
      "O aniversário não pode estar no futuro.",
    ),
  vip: z.boolean().default(false),
  notes: z.string().trim().max(3000).default(""),
});
export const reservationInput = z.object({
  name: crmName,
  phone: crmPhone,
  email: crmEmail,
  date: calendarDate,
  time: reservationTime,
  guests: z
    .number()
    .int()
    .min(1, "Indique entre 1 e 50 pessoas.")
    .max(50, "Indique entre 1 e 50 pessoas."),
  occasion: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(2000).default(""),
  privacyAccepted: z.boolean().default(false),
});
export const reservationPatch = z.object({
  revision: z.number().int().min(0),
  date: calendarDate.optional(),
  time: reservationTime.optional(),
  guests: z.number().int().min(1).max(50).optional(),
  internalNotes: z.string().trim().max(3000).optional(),
  status: z
    .enum(["pending", "confirmed", "declined", "cancelled", "completed"])
    .optional(),
  customerId: z.string().uuid().optional(),
});
export const privacyNotice =
  "Autorizo a utilização dos meus dados para tratar este pedido de reserva. Os dados são usados para gerir a reserva, contactar-me e manter o histórico de atendimento; não autorizam marketing. Política de privacidade: /privacidade (versão 2026-10-19).";
