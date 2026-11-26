import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return dateFmt.format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return dateTimeFmt.format(new Date(d));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Server-render timestamp (server components render once per request). */
export function requestTime() {
  return new Date().getTime();
}
