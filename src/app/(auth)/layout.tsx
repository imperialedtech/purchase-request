import Image from "next/image";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/admin";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings(db);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <Image src="/brand/iet-logo-white.png" alt="Imperial EdTech" width={180} height={32} priority className="h-8 w-auto" />
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">{settings.appName}</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Raise purchase requests, route them through Functional, Finance and Chief of Staff approval, and keep a complete, auditable record — without paperwork.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {["Sequential three-level approval", "Automatic PR numbering & PDF records", "Real-time status and notifications"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400">Internal system · Authorised personnel only{settings.supportEmail ? ` · Support: ${settings.supportEmail}` : ""}</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
