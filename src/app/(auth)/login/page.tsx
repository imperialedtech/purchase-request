import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  if (await getActor()) redirect("/");
  const sp = await searchParams;
  return (
    <>
      <div className="mb-8">
        <div className="mb-6 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-navy-900 text-sm font-bold text-white lg:hidden">IET</div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-500">Use your Imperial EdTech account.</p>
      </div>
      <LoginForm next={sp.next} activated={sp.activated === "1"} />
    </>
  );
}
