import Decimal from "decimal.js";

// Shared, client-safe money maths. The server recomputes everything with these
// same functions; client values are only ever used for preview.

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const SUPPORTED_CURRENCIES = ["NGN", "USD", "EUR", "GBP"] as const;

export function toDecimal(v: Decimal.Value | { toString(): string } | null | undefined): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return new Decimal(typeof v === "object" && !(v instanceof Decimal) ? v.toString() : (v as Decimal.Value));
}

export function lineTotal(quantity: Decimal.Value, unitPrice: Decimal.Value): Decimal {
  return new Decimal(quantity).mul(new Decimal(unitPrice)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type MoneyByCurrency = Record<string, string>;

/** Sums line totals per currency. Different currencies are never added together. */
export function totalsByCurrency(
  items: { currency: string; quantity: Decimal.Value; unitPrice: Decimal.Value }[],
): MoneyByCurrency {
  const acc: Record<string, Decimal> = {};
  for (const it of items) {
    const t = lineTotal(it.quantity, it.unitPrice);
    acc[it.currency] = (acc[it.currency] ?? new Decimal(0)).add(t);
  }
  return Object.fromEntries(Object.entries(acc).map(([c, v]) => [c, v.toFixed(2)]));
}

export function formatMoney(amount: Decimal.Value | { toString(): string } | null | undefined, currency?: string | null) {
  const d = toDecimal(amount as Decimal.Value);
  const n = d.toNumber();
  if (!currency) return n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatTotals(t: MoneyByCurrency) {
  const entries = Object.entries(t);
  if (entries.length === 0) return "—";
  return entries.map(([c, v]) => formatMoney(v, c)).join(" + ");
}

/** Short form for KPI tiles, e.g. "NGN 2.35M". Full values are shown in tooltips and tables. */
export function formatCompactMoney(amount: Decimal.Value, currency: string) {
  const n = new Decimal(amount).toNumber();
  const f = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  return `${currency} ${f}`;
}
