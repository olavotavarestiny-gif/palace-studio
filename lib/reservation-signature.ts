import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./validation";
export function reservationSignature(
  secret: string,
  timestamp: string,
  clientKey: string,
  key: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${clientKey}.${key}.${body}`)
    .digest("hex");
}
export function verifyReservationSignature(
  request: Request,
  body: string,
  secret = process.env.PALACE_RESERVATION_SECRET,
  now = Date.now(),
) {
  if (!secret || secret.length < 32)
    throw new AppError(
      "O serviço de reservas ainda não está configurado.",
      503,
    );
  const timestamp = request.headers.get("x-palace-timestamp") || "",
    signature = request.headers.get("x-palace-signature") || "",
    clientKey = request.headers.get("x-palace-client") || "global",
    key = request.headers.get("idempotency-key") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^(global|[a-f0-9]{64})$/.test(clientKey)
  )
    throw new AppError("Pedido não autorizado.", 401);
  const expected = reservationSignature(
    secret,
    timestamp,
    clientKey,
    key,
    body,
  );
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    )
  )
    throw new AppError("Pedido não autorizado.", 401);
  return { key, clientKey };
}
