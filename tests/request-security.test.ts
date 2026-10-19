import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSameOrigin } from "../lib/request-security";

function request(origin: string | null, host = "localhost:3000") {
  const headers = new Headers({ host });
  if (origin) headers.set("origin", origin);
  return new Request("http://127.0.0.1:3000/api/auth/login", { method: "POST", headers });
}

test("aceita o endereço localhost usado pelo browser quando Next.js usa 127.0.0.1 internamente", () => {
  assert.doesNotThrow(() => assertSameOrigin(request("http://localhost:3000"), ""));
  assert.doesNotThrow(() => assertSameOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000"), ""));
});

test("mantém a protecção contra origens externas, portas diferentes e origem ausente", () => {
  for (const origin of ["https://example.invalid", "http://localhost:4000", "null", null]) {
    assert.throws(() => assertSameOrigin(request(origin), ""), /Origem do pedido não autorizada/);
  }
});

test("aceita o URL público explicitamente configurado atrás de um proxy", () => {
  assert.doesNotThrow(() => assertSameOrigin(request("https://menu.example.invalid"), "https://menu.example.invalid"));
  assert.throws(() => assertSameOrigin(request("https://outro.example.invalid"), "https://menu.example.invalid"));
});
