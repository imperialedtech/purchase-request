"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrendChart({ data }: { data: { label: string; submitted: number; approved: number; rejected: number }[] }) {
  const empty = data.every((d) => d.submitted === 0);
  if (empty) return <p className="flex h-56 items-center justify-center text-sm text-slate-400">No submissions in the last 12 months</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9c9c9c" }} tickLine={false} axisLine={{ stroke: "#3a3a3a" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9c9c9c" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#1d1d1d" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #3a3a3a", background: "#101010", color: "#f5f5f5" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="submitted" name="Submitted" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="approved" name="Approved" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="rejected" name="Rejected" fill="#737373" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
