import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await currentUser()) redirect("/studio");
  if (!(await one("SELECT id FROM users LIMIT 1"))) redirect("/setup");
  return <AuthForm setup={false} />;
}
