import Link from "next/link";
import { db } from "@/server/db";
import { findValidUserToken } from "@/server/services/auth";
import { SetPasswordForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata = { title: "Set your password" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.length < 200 ? await findValidUserToken(db, token) : null;
  if (!t)
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900">Link expired</h2>
        <Alert tone="amber">This activation or reset link is invalid, already used, or expired. Ask your system administrator for a new link.</Alert>
        <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t.purpose === "INVITE" ? "Activate your account" : "Reset your password"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t.user.name} · {t.user.email}
        </p>
      </div>
      <SetPasswordForm token={token} />
    </>
  );
}
