import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db, one, type Connection } from "./db";
import { AppError } from "./validation";
const scrypt = promisify(scryptCb);
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [, salt, hex] = stored.split(":");
  const expected = Buffer.from(hex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export type User = { id: string; name: string; email: string };
export async function currentUser() {
  const token = (await cookies()).get("palace_session")?.value;
  if (!token) return null;
  return one<User>(
    "SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE",
    [hashToken(token)],
  );
}
export async function requireUser() {
  const user = await currentUser();
  if (!user)
    throw new AppError(
      "A sessão expirou. Entre novamente para continuar.",
      401,
    );
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await (await db()).query("DELETE FROM sessions WHERE expires_at < NOW()");
  await (
    await db()
  ).query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '12 hours')",
    [hashToken(token), userId],
  );
  (await cookies()).set("palace_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" && !process.env.ALLOW_HTTP_LOCAL,
    path: "/",
    maxAge: 43200,
  });
}
export async function firstAdmin(
  name: string,
  email: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  return (await db()).transaction(async (tx: Connection) => {
    await tx.query("SELECT id FROM settings WHERE id=1 FOR UPDATE");
    if (await one("SELECT id FROM users LIMIT 1", [], tx))
      throw new AppError("A primeira conta já foi criada.", 409);
    const id = randomUUID();
    await tx.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES ($1,$2,$3,$4)",
      [id, name, email, passwordHash],
    );
    return id;
  });
}
export async function login(email: string, password: string) {
  const key = hashToken(email.toLowerCase());
  const database = await db();
  const allowed = await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO auth_attempts(key,failures) VALUES ($1,0) ON CONFLICT DO NOTHING",
      [key],
    );
    await tx.query(
      "UPDATE auth_attempts SET failures=0,started_at=NOW() WHERE key=$1 AND started_at<NOW()-INTERVAL '15 minutes'",
      [key],
    );
    return one<{ failures: number }>(
      "UPDATE auth_attempts SET failures=failures+1 WHERE key=$1 RETURNING failures",
      [key],
      tx,
    );
  });
  if (!allowed || allowed.failures > 10)
    throw new AppError(
      "Demasiadas tentativas. Tente novamente dentro de 15 minutos.",
      429,
    );
  const user = await one<User & { password_hash: string }>(
    "SELECT id,name,email,password_hash FROM users WHERE email=$1 AND active=TRUE",
    [email],
  );
  const dummy = "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
  if (!(await verifyPassword(password, user?.password_hash || dummy)) || !user)
    throw new AppError("Email ou palavra-passe incorrectos.", 401);
  await database.query("DELETE FROM auth_attempts WHERE key=$1", [key]);
  await createSession(user.id);
}
