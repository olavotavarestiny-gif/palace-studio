import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/request-security";
import { readJson, privateJson, crmError } from "@/lib/http";
import {
  createCustomer,
  createReservation,
  customerDetail,
  listCustomers,
  listReservations,
  reservationDetail,
  updateCustomer,
  updateReservation,
} from "@/lib/crm";
import { AppError } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const user = await requireUser();
    if (request.method !== "GET") assertSameOrigin(request);
    const parts = (await context.params).path,
      resource = parts[0];
    const id = parts.length === 2 ? z.string().uuid().parse(parts[1]) : null;
    if (parts.length > 2 || !["reservations", "customers"].includes(resource))
      throw new AppError("Endereço não encontrado.", 404);
    if (request.method === "GET") {
      if (resource === "reservations")
        return privateJson(
          id
            ? await reservationDetail(id)
            : await listReservations(new URL(request.url).searchParams),
        );
      return privateJson(
        id
          ? await customerDetail(id)
          : await listCustomers(new URL(request.url).searchParams),
      );
    }
    if (request.method === "POST" && !id) {
      const input = await readJson(request);
      if (resource === "reservations") {
        const result = await createReservation(
          input,
          request.headers.get("idempotency-key") || "",
          "manual",
          user.id,
        );
        return privateJson(
          await reservationDetail(result.id),
          result.duplicate ? 200 : 201,
        );
      }
      return privateJson(await createCustomer(input, user.id), 201);
    }
    if (request.method === "PATCH" && id) {
      const input = await readJson(request);
      return privateJson(
        resource === "reservations"
          ? await updateReservation(id, input, user.id)
          : await updateCustomer(id, input, user.id),
      );
    }
    throw new AppError("Operação não disponível.", 405);
  } catch (error) {
    return crmError(error);
  }
}
export { handle as GET, handle as POST, handle as PATCH };
