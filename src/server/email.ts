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
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(opts: { to: string; subject: string; lines: [string, string][]; intro: string; link?: string }) {
  const t = getTransport();
  if (!t) return false;
  const rows = opts.lines
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(k)}</td><td style="padding:4px 0;color:#0f172a"><b>${esc(v)}</b></td></tr>`)
    .join("");
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
<p style="color:#0f172a">${esc(opts.intro)}</p>
<table style="font-size:14px;border-collapse:collapse">${rows}</table>
${opts.link ? `<p><a href="${esc(opts.link)}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open purchase request</a></p>` : ""}
<p style="color:#94a3b8;font-size:12px">Internal Purchase Request &amp; Approval System — automated message.</p></div>`;
  const text = [opts.intro, "", ...opts.lines.map(([k, v]) => `${k}: ${v}`), "", opts.link ?? ""].join("\n");
  await t.sendMail({ from: process.env.SMTP_FROM, to: opts.to, subject: opts.subject, text, html });
  return true;
}
