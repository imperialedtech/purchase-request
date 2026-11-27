import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "@/components/auth-forms";
import Link from "next/link";
import { db } from "@/server/db";
import { setupNeeded } from "@/server/services/setup";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  if (await getActor()) redirect("/");
  const sp = await searchParams;
  const firstRun = await setupNeeded(db);
  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-500">Use your Imperial EdTech account.</p>
      </div>
      <LoginForm next={sp.next} activated={sp.activated === "1"} />
      {firstRun && (
        <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          No administrator exists yet. <Link href="/setup" className="font-semibold underline">Run first-time setup</Link>
        </p>
      )}
    </>
  );
}
