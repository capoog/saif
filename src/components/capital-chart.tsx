"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function CapitalChart({ data }: { data: { week: number; target: number; actual: number | null }[] }) {
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#94a3b8" strokeOpacity={0.25} strokeDasharray="3 3" />
          <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
          <YAxis scale="log" domain={[15000, 1000000]} allowDataOverflow ticks={[20000, 50000, 100000, 250000, 500000, 1000000]} tickFormatter={(v) => compact.format(v)} tick={{ fill: "#94a3b8", fontSize: 11 }} width={44} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, direction: "rtl" }}
            labelFormatter={(w) => `أسبوع ${w}`}
            formatter={(v, name) => [full.format(Number(v)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="target" name="المستهدف" stroke="#94a3b8" strokeDasharray="5 4" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="actual" name="الفعلي" stroke="#14b8a6" strokeWidth={3} dot={{ r: 3, fill: "#14b8a6" }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
