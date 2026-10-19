import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./validation";
export async function limitedText(request: Request, limit = 32000) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Pedido vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("Pedido demasiado grande.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Formato de pedido inválido.", 415);
  try {
    return JSON.parse(await limitedText(request));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Pedido inválido.");
  }
}
export const privateJson = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function crmError(error: unknown) {
  if (error instanceof AppError)
    return privateJson({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return privateJson(
      { error: error.issues[0]?.message || "Verifique os dados introduzidos." },
      400,
    );
  if ((error as { code?: string })?.code === "23505")
    return privateJson(
      {
        error:
          "Este contacto já existe. Actualize a lista para encontrar o registo.",
      },
      409,
    );
  console.error("CRM request failed", {
    type: error instanceof Error ? error.name : "Unknown",
    code: (error as { code?: string })?.code,
  });
  return privateJson(
    {
      error:
        "Não foi possível concluir. Os dados introduzidos continuam disponíveis para tentar novamente.",
    },
    500,
  );
}
