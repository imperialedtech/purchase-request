"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TOOLTIP_STYLE } from "./palette";

export type DonutSlice = { key: string; label: string; count: number; color: string; href: string };

/** Share of requests by status group, with the total in the centre and a labelled legend. */
export function StatusDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((a, s) => a + s.count, 0);
  const shown = slices.filter((s) => s.count > 0);
  if (total === 0) return <p className="flex h-56 items-center justify-center text-sm text-slate-400">No purchase requests yet</p>;
  return (
    <div className="flex flex-col items-center gap-5 p-5">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#f5f5f5" }} formatter={(v, n) => [`${v} (${Math.round((Number(v) / total) * 100)}%)`, n]} />
            <Pie data={shown} dataKey="count" nameKey="label" innerRadius="72%" outerRadius="100%" paddingAngle={shown.length > 1 ? 3 : 0} cornerRadius={4} stroke="#101010" strokeWidth={2} startAngle={90} endAngle={-270}>
              {shown.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900">{total}</span>
          <span className="text-[11px] text-slate-500">requests</span>
        </div>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 text-slate-700">{s.label}</span>
              <span className="font-semibold text-slate-900">{s.count}</span>
              <span className="w-9 text-right text-slate-500">{Math.round((s.count / total) * 100)}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
