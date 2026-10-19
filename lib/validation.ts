import { z } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const text = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(160, "Máximo de 160 caracteres.");
export const price = z
  .number()
  .finite()
  .min(0, "Preço inválido.")
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.01,
    "Use no máximo duas casas decimais.",
  );
export const photo = z
  .string()
  .regex(/^\/api\/photos\/[a-f0-9-]+\.webp$/)
  .nullable()
  .default(null);
export const categoryInput = z.object({
  name: text,
  position: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});
export const dishInput = z.object({
  name: text,
  category_id: z.string().uuid(),
  description: z.string().trim().max(1200).default(""),
  price,
  photo,
  active: z.boolean().default(true),
});
export const menuItemInput = z.object({
  id: z.string().uuid(),
  dishId: z.string().uuid().nullable(),
  categoryId: z.string().uuid(),
  categoryName: text,
  name: text,
  description: z.string().trim().max(1200),
  price,
  photo,
});
export const menuInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
      "Data inválida.",
    ),
  revision: z.number().int().min(0),
  items: z.array(menuItemInput).max(300, "Máximo de 300 pratos por menu."),
});
export const accountInput = z.object({
  name: text,
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(12, "Utilize pelo menos 12 caracteres.").max(128),
});
export const settingsInput = z.object({
  restaurantName: text,
  website: z.union([
    z.literal(""),
    z.url().refine((v) => /^https?:\/\//.test(v)),
  ]),
  contact: z
    .string()
    .trim()
    .max(100)
    .refine(
      (v) =>
        !v || z.email().safeParse(v).success || /^\+?[\d\s()-]{6,30}$/.test(v),
      "Introduza um telefone ou email válido.",
    ),
});
