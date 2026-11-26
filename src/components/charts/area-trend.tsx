"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { APPROVED, AXIS_TEXT, GRID, SUBMITTED, TOOLTIP_STYLE } from "./palette";

type Month = { label: string; submitted: number; approved: number; rejected: number; value: number };
const RANGES = [
  { key: "3M", n: 3 },
  { key: "6M", n: 6 },
  { key: "12M", n: 12 },
] as const;

const compact = (n: number) => new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Tabs<T extends string>({ label, options, value, onChange }: { label: string; options: { key: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", value === o.key ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** Request volume (submitted vs approved) or approved value over time, with range tabs. One measure per view, one axis. */
export function AreaTrend({ data, currency }: { data: Month[]; currency: string }) {
  const [range, setRange] = useState<"3M" | "6M" | "12M">("12M");
  const [metric, setMetric] = useState<"volume" | "value">("volume");
  const rows = data.slice(-RANGES.find((r) => r.key === range)!.n);
  const totals = rows.reduce((a, r) => ({ submitted: a.submitted + r.submitted, approved: a.approved + r.approved }), { submitted: 0, approved: 0 });
  const best = rows.reduce((b, r) => (r.value > b.value ? r : b), rows[0]);
  const active = { r: 5, strokeWidth: 2, stroke: "#101010" };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Tabs label="Measure" value={metric} onChange={setMetric} options={[{ key: "volume", text: "Requests" }, { key: "value", text: `Approved value (${currency})` }]} />
        <Tabs label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ key: r.key, text: r.key }))} />
      </div>

      {metric === "volume" ? (
        <div className="flex gap-5 px-5 pt-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SUBMITTED }} />
            Submitted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: APPROVED }} />
            Approved
          </span>
        </div>
      ) : (
        <p className="px-5 pt-3 text-xs text-slate-500">Value of requests fully approved each month, in {currency}</p>
      )}

      <div className="h-72 px-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gSub" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SUBMITTED} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SUBMITTED} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gApp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={APPROVED} stopOpacity={0.3} />
                <stop offset="100%" stopColor={APPROVED} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} dy={6} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (metric === "value" ? compact(v) : String(v))} />
            <Tooltip
              cursor={{ stroke: "#525252", strokeDasharray: "3 3" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: AXIS_TEXT, marginBottom: 4 }}
              formatter={(v, name) => [metric === "value" ? `${currency} ${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : String(v), name]}
            />
            {metric === "volume" ? (
              <>
                <Area type="monotone" dataKey="submitted" name="Submitted" stroke={SUBMITTED} strokeWidth={2} fill="url(#gSub)" activeDot={active} />
                <Area type="monotone" dataKey="approved" name="Approved" stroke={APPROVED} strokeWidth={2} fill="url(#gApp)" activeDot={active} />
              </>
            ) : (
              <Area type="monotone" dataKey="value" name="Approved value" stroke={SUBMITTED} strokeWidth={2} fill="url(#gSub)" activeDot={active} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 text-xs">
        <div className="px-5 py-3">
          <p className="text-slate-500">Submitted ({range})</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{totals.submitted}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-slate-500">Approved ({range})</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{totals.approved}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-slate-500">Best month by value</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{best && best.value > 0 ? `${best.label} · ${currency} ${compact(best.value)}` : "—"}</p>
        </div>
      </div>
    </div>
  );
}
