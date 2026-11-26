import Link from "next/link";
import { db } from "@/server/db";
import { setupCodeConfigured, setupNeeded } from "@/server/services/setup";
import { SetupForm } from "@/components/setup-form";
import { Alert } from "@/components/ui";

export const metadata = { title: "First-time setup" };

export default async function SetupPage() {
  const needed = await setupNeeded(db);
  if (!needed)
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900">Setup complete</h2>
        <Alert tone="blue">An administrator already exists, so this page is disabled. Sign in, or ask your administrator for an invitation.</Alert>
        <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">First-time setup</h2>
        <p className="mt-1 text-sm text-slate-500">Create the first System Administrator. This page disappears once it is done.</p>
      </div>
      {setupCodeConfigured() ? (
        <SetupForm />
      ) : (
        <Alert tone="amber" title="Setup code not configured">
          In Vercel, open purchase-request → Settings → Environment Variables and add <b>SETUP_CODE</b> with a value you make up (at least 12 characters). Then redeploy and reload this page.
        </Alert>
      )}
    </>
  );
}
