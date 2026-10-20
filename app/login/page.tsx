import { redirect } from "next/navigation";
import Login from "@/components/Login";
import { getDb } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { countUsers } from "@/lib/server/store";

export const metadata = { title: "Anmelden – STACK-Editor" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Nur relative Ziele innerhalb der App zulassen
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUser()) redirect(target);
  return <Login setup={await countUsers(await getDb()) === 0} next={target} />;
}
