import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Studio } from "@/components/studio";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const section = (await params).section?.join("/") || "inicio";
  if (
    ![
      "inicio",
      "biblioteca",
      "menu",
      "publicacoes",
      "reservas",
      "clientes",
    ].includes(section)
  )
    notFound();
  return <Studio section={section} />;
}
