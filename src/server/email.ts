import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!emailConfigured()) return (transporter = null);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    // port 465 is TLS from the start (e.g. Google Workspace smtp.gmail.com:465); 587 upgrades with STARTTLS
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type EmailAction = { label: string; href: string; tone?: "red" | "green" };

export async function sendEmail(opts: { to: string; subject: string; lines: [string, string][]; intro: string; link?: string; actions?: EmailAction[] }) {
  const t = getTransport();
  if (!t) return false;
  const actions: EmailAction[] = opts.actions ?? (opts.link ? [{ label: "Open purchase request", href: opts.link }] : []);
  const rows = opts.lines
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#0f172a;white-space:pre-wrap"><b>${esc(v)}</b></td></tr>`)
    .join("");
  const buttons = actions
    .map((a) => `<a href="${esc(a.href)}" style="display:inline-block;background:${a.tone === "green" ? "#15803d" : "#dc2626"};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;margin:0 8px 8px 0">${esc(a.label)}</a>`)
    .join("");
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px">
<p style="color:#0f172a">${esc(opts.intro)}</p>
<table style="font-size:14px;border-collapse:collapse">${rows}</table>
${buttons ? `<p style="margin-top:18px">${buttons}</p>` : ""}
<p style="color:#94a3b8;font-size:12px">Internal Purchase Request &amp; Approval System — automated message. You will be asked to sign in before any action is taken.</p></div>`;
  const text = [opts.intro, "", ...opts.lines.map(([k, v]) => `${k}: ${v}`), "", ...actions.map((a) => `${a.label}: ${a.href}`)].join("\n");
  await t.sendMail({ from: process.env.SMTP_FROM, to: opts.to, subject: opts.subject, text, html });
  return true;
}
