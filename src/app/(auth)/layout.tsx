import Image from "next/image";
import { Check, Clock } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/admin";
import { Skyline } from "@/components/auth/skyline";

/** Illustration of what the system does: a request moving through the three approval levels. */
function ApprovalCards() {
  const stages = [
    { name: "Functional Responsible", who: "Level 1", done: true },
    { name: "Finance Manager", who: "Level 2", done: true },
    { name: "Chief of Staff", who: "Level 3", done: false },
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm">
      <div className="iet-float rounded-2xl border border-white/10 bg-black/55 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#f87171]">IET-PR-2026-0042</span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-200 ring-inset">Pending final approval</span>
        </div>
        <p className="mt-2 text-sm font-medium text-white">Laptops for new operations staff</p>
        <p className="text-xs text-slate-500">NGN 2,350,000.00 · IT Equipment</p>
        <ol className="mt-4 space-y-2.5">
          {stages.map((s) => (
            <li key={s.name} className="flex items-center gap-3">
              <span className={s.done ? "flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] text-white" : "flex h-6 w-6 items-center justify-center rounded-full bg-[#dc2626] text-white ring-4 ring-[#dc2626]/25"}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 text-xs text-slate-700">{s.name}</span>
              <span className="text-[10px] text-slate-500">{s.done ? "Approved" : "Awaiting"}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="iet-float-slow absolute -right-6 -bottom-8 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/70 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#16a34a]/20 text-[#4ade80]">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-medium text-white">Finance Manager approved</p>
          <p className="text-[10px] text-slate-500">just now</p>
        </div>
      </div>
    </div>
  );
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings(db);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-black lg:block">
        <Skyline className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/30" />
        <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <Image src="/brand/iet-logo-white.png" alt="Imperial EdTech" width={115} height={22} priority className="h-[22px] w-auto" />
          </div>

          <div className="grid gap-12 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="max-w-md">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#f87171] uppercase">Purchase requests</p>
              <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-white">{settings.appName}</h1>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Raise purchase requests, route them through Functional, Finance and Chief of Staff approval, and keep a complete, auditable record — without paperwork.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
                {["Sequential three-level approval", "Automatic PR numbering & PDF records", "Live chat and email notifications"].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden pb-8 xl:block xl:w-80">
              <ApprovalCards />
            </div>
          </div>

          <p className="text-xs text-slate-500">Internal system · Authorised personnel only{settings.supportEmail ? ` · Support: ${settings.supportEmail}` : ""}</p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden p-6 sm:p-10">
        {/* small screens: faint skyline behind the form */}
        <Skyline id="m" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full opacity-40 lg:hidden" />
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(220,38,38,0.16),transparent)]" />
        <div className="relative w-full max-w-sm">
          <Image src="/brand/iet-logo-white.png" alt="Imperial EdTech" width={140} height={27} priority className="mb-10 h-[27px] w-auto" />
          {children}
        </div>
      </main>
    </div>
  );
}
