import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type PRStatusKey, type Tone } from "@/lib/status";

// ───────────── Buttons ─────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
// Filled buttons are red with white text. Approve (success) and clarify (warning) keep their
// conventional colours so approvers can't confuse them with Reject.
const variants: Record<Variant, string> = {
  primary: "bg-[#dc2626] text-white hover:bg-[#b91c1c] shadow-sm",
  secondary: "bg-surface text-slate-800 border border-slate-300 hover:bg-slate-100 hover:border-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-[#991b1b] text-white hover:bg-[#7f1d1d] shadow-sm",
  success: "bg-[#15803d] text-white hover:bg-[#166534] shadow-sm",
  warning: "bg-[#b45309] text-white hover:bg-[#92400e] shadow-sm",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-5 text-sm" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ href, variant = "primary", size = "md", className, children, ...rest }: { href: string; variant?: Variant; size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

// ───────────── Form controls ─────────────

const control =
  "w-full rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...p} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "py-2 leading-relaxed", className)} {...p} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(control, "h-9 pr-8", className)} {...p} />;
});

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-slate-600", className)} {...p} />;
}

export function Field({ label, htmlFor, error, hint, children, className, required, group }: { label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean; group?: boolean }) {
  const caption = (
    <>
      {label}
      {required && <span className="text-red-500"> *</span>}
    </>
  );
  const note = error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null;
  // With an explicit htmlFor (or for a group of controls) use a separate label; otherwise wrap the
  // control in the <label> so it is programmatically associated without needing an id.
  if (htmlFor || group)
    return (
      <div className={className} role={group ? "group" : undefined} aria-label={group ? label : undefined}>
        {htmlFor ? <Label htmlFor={htmlFor}>{caption}</Label> : <span className="mb-1 block text-xs font-medium text-slate-600">{caption}</span>}
        {children}
        {note}
      </div>
    );
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{caption}</span>
      {children}
      {note}
    </label>
  );
}

export function Checkbox({ label, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("inline-flex items-start gap-2 text-sm text-slate-700", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...p} />
      <span>{label}</span>
    </label>
  );
}

// ───────────── Surfaces ─────────────

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-slate-200 bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)} {...p} />;
}

export function CardHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-slate-500">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────────── Badges ─────────────

const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  slate: "bg-slate-100 text-slate-500 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const s = status as PRStatusKey;
  return <Badge tone={STATUS_TONE[s] ?? "gray"}>{STATUS_LABEL[s] ?? status}</Badge>;
}

// ───────────── Tables ─────────────

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...p} />
    </div>
  );
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500", className)} {...p} />;
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-slate-100 px-4 py-3 align-top text-slate-700", className)} {...p} />;
}

// ───────────── Feedback ─────────────

export function Alert({ tone = "blue", title, children, className }: { tone?: "blue" | "red" | "amber" | "green"; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const t = { blue: "border-blue-200 bg-blue-50 text-blue-900", red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", t, className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1", "opacity-90")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon, href, tone = "slate" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; href?: string; tone?: "slate" | "blue" | "amber" | "green" | "red" | "orange" | "violet" }) {
  const iconTone = { slate: "bg-slate-100 text-slate-600", blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600", orange: "bg-orange-50 text-orange-600", violet: "bg-violet-50 text-violet-600" }[tone];
  const body = (
    <Card className={cn("flex items-start gap-3 p-4", href && "transition hover:border-brand-200 hover:shadow-sm")}>
      {icon && <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", iconTone)}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className="mt-0.5 truncate text-xl font-semibold text-slate-900">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
