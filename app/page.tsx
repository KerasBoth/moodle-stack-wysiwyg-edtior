import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { currentUser } from "@/lib/server/session";

export const metadata = { title: "Dashboard – STACK-Editor" };

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard user={user} />;
}
