"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { firstAdminSetupAction } from "@/app/actions/setup";
import { Alert, Button, Field, Input } from "@/components/ui";

export function SetupForm() {
  const [state, action, pending] = useActionState(firstAdminSetupAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <Field label="Setup code" error={fe?.code} hint="The SETUP_CODE value you saved in Vercel.">
        <Input name="code" type="password" autoComplete="off" required />
      </Field>
      <Field label="Your full name" error={fe?.name}>
        <Input name="name" autoComplete="name" required />
      </Field>
      <Field label="Work email" error={fe?.email}>
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Job title" error={fe?.jobTitle}>
        <Input name="jobTitle" autoComplete="organization-title" />
      </Field>
      <Field label="Password" error={fe?.password} hint="At least 10 characters with upper- and lowercase letters and a number.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" error={fe?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create administrator &amp; sign in
      </Button>
    </form>
  );
}
