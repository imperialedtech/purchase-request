"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrendChart({ data }: { data: { label: string; submitted: number; approved: number; rejected: number }[] }) {
  const empty = data.every((d) => d.submitted === 0);
  if (empty) return <p className="flex h-56 items-center justify-center text-sm text-slate-400">No submissions in the last 12 months</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="#eef1f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="submitted" name="Submitted" fill="#3b6ef5" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="rejected" name="Rejected" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
