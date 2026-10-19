import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { accountInput } from "../lib/validation";
import { firstAdmin } from "../lib/auth";
import { one } from "../lib/db";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  if (await one("SELECT id FROM users LIMIT 1"))
    throw new Error("Já existe uma conta administrativa. Utilize /login.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = await rl.question("Nome: "),
      email = await rl.question("Email: ");
    stdout.write("Palavra-passe (mínimo 12 caracteres; introdução oculta): ");
    let password = "";
    if (stdin.isTTY) {
      rl.close();
      stdin.setRawMode(true);
      stdin.resume();
      password = await new Promise<string>((resolve) => {
        let value = "";
        const listener = (chunk: Buffer) => {
          for (const c of chunk.toString()) {
            if (c === "\u0003") process.exit(130);
            if (c === "\r" || c === "\n") {
              stdin.off("data", listener);
              stdin.setRawMode(false);
              stdout.write("\n");
              resolve(value);
              return;
            }
            if (c === "\u007f") value = value.slice(0, -1);
            else value += c;
          }
        };
        stdin.on("data", listener);
      });
    } else password = await rl.question("");
    const account = accountInput.parse({ name, email, password });
    await firstAdmin(account.name, account.email, account.password);
    stdout.write("Administrador criado. Entre em /login.\n");
    process.exit(0);
  } finally {
    rl.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
