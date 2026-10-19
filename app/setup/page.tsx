import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await one("SELECT id FROM users LIMIT 1")) redirect("/login");
  return (
    <AuthForm
      setup
      needsToken={
        !!process.env.SETUP_TOKEN || process.env.NODE_ENV === "production"
      }
    />
  );
}
