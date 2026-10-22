import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getT } from "@/lib/i18n/server";
import { currentUser } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("dashboard.title")} – ${t("common.appName")}` };
}

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard user={user} />;
}
