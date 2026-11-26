"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { TOOLTIP_STYLE } from "./palette";

/** Small trend line for KPI cards: recent months of one measure, with a hover tooltip. */
export function Sparkline({ data, color, unit }: { data: { label: string; v: number | null }[]; color: string; unit?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="h-14 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "#3a3a3a" }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#9c9c9c" }}
            formatter={(v) => [v == null ? "—" : `${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`, ""]}
            separator=""
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp${id})`} connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#101010" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
