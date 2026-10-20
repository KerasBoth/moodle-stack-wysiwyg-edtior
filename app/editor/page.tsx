import { redirect } from "next/navigation";
import StackEditorApp from "@/components/App";
import { currentUser } from "@/lib/server/session";

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ file?: string; new?: string; category?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    redirect(`/login?next=${encodeURIComponent(`/editor${qs ? `?${qs}` : ""}`)}`);
  }
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return (
    <StackEditorApp
      user={user}
      initialFileId={num(sp.file)}
      startNew={sp.new === "1"}
      initialCategoryId={num(sp.category)}
    />
  );
}
