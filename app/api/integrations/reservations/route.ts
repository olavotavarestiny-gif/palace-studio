import { createReservation } from "@/lib/crm";
import { verifyReservationSignature } from "@/lib/reservation-signature";
import { limitedText, privateJson, crmError } from "@/lib/http";
import { AppError } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const raw = await limitedText(request);
    const { key, clientKey } = verifyReservationSignature(request, raw);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new AppError("Pedido inválido.");
    }
    const result = await createReservation(
      data,
      key,
      "website",
      null,
      clientKey,
    );
    // No customer profile, telephone, email, internal notes or VIP flags are public.
    return privateJson(
      { received: true, reference: result.id },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    return crmError(error);
  }
}
