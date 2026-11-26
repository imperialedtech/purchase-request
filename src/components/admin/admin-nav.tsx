"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 [scrollbar-width:none]" aria-label="Administration">
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap", active ? "border-brand-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
