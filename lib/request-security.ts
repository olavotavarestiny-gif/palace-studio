import { AppError } from "./validation";

export function assertSameOrigin(request: Request, publicUrl = process.env.PUBLIC_URL) {
  const origin = request.headers.get("origin");
  const internalUrl = new URL(request.url);
  const allowed = new Set([internalUrl.origin]);

  // Next.js can construct request.url with its listen address (127.0.0.1),
  // even when the browser requested localhost. Host is the browser's target
  // authority, so compare against it as well, using the request protocol.
  const host = request.headers.get("host");
  if (host && /^[a-z0-9.\-:[\]]+$/i.test(host)) {
    allowed.add(new URL(`${internalUrl.protocol}//${host}`).origin);
  }
  if (publicUrl) allowed.add(new URL(publicUrl).origin);

  if (!origin || !allowed.has(origin)) {
    throw new AppError("Origem do pedido não autorizada.", 403);
  }
}
