"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";

const ICONS = { dashboard: LayoutDashboard, requests: FolderOpen, mine: FileText, approvals: ClipboardCheck, reports: BarChart3, notifications: Bell, admin: ShieldCheck, settings: Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function AppShell({
  nav,
  user,
  unread,
  canCreate,
  children,
}: {
  nav: NavItem[];
  user: { name: string; email: string; jobTitle: string | null; roles: string[] };
  unread: number;
  canCreate: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <div className="flex h-full flex-col border-r border-slate-200 bg-navy-900 text-slate-700">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <Image src="/brand/iet-logo-white.png" alt="Imperial EdTech" width={140} height={26} className="h-6 w-auto" priority />
      </div>
      <div className="px-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Purchase Requests</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-500" : "text-slate-500 group-hover:text-slate-800")} />
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{n.badge > 99 ? "99+" : n.badge}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.jobTitle ?? user.email}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-white" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
          <button className="absolute top-4 left-[16.5rem] rounded-md bg-surface p-1.5 text-slate-700" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/requests?q=${encodeURIComponent(q.trim())}`);
            }}
            role="search"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search PR number, requestor, item…"
              aria-label="Search purchase requests"
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-500 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            {canCreate && (
              <Link href="/requests/new" className="hidden h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-[#b91c1c] sm:inline-flex">
                <Plus className="h-4 w-4" /> New request
              </Link>
            )}
            <Link href="/notifications" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      {canCreate && (
        <Link href="/requests/new" className="fixed right-5 bottom-5 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg sm:hidden" aria-label="New request">
          <Plus className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
