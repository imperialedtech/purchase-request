import { requireAdmin } from "@/server/admin-guard";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/admin";
import { emailConfigured } from "@/server/email";
import { SettingsEditor } from "@/components/admin/config-editors";

export const metadata = { title: "System settings" };

export default async function SystemSettingsPage() {
  await requireAdmin("admin.settings");
  const s = await getSettings(db);
  return (
    <SettingsEditor
      initial={{ appName: s.appName, companyName: s.companyName, supportEmail: s.supportEmail, pdfShowComments: s.pdfShowComments, overdueHighlightHours: s.overdueHighlightHours }}
      email={{ configured: emailConfigured(), host: process.env.SMTP_HOST || null, from: process.env.SMTP_FROM || null }}
    />
  );
}
