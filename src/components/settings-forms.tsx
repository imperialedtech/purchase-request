"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { changePasswordAction, updateProfileAction } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export function ProfileForm({ name, jobTitle, phone, canEdit }: { name: string; jobTitle: string; phone: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="space-y-4">
      {state && <Alert tone={state.ok ? "green" : "red"}>{state.ok ? state.message : state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" hint={canEdit ? undefined : "Managed by your administrator"}>
          <Input name="name" defaultValue={name} disabled={!canEdit} required />
        </Field>
        <Field label="Job title" hint={canEdit ? undefined : "Managed by your administrator"}>
          <Input name="jobTitle" defaultValue={jobTitle} disabled={!canEdit} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={phone} maxLength={40} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="max-w-md space-y-4">
      {state && <Alert tone={state.ok ? "green" : "red"}>{state.ok ? state.message : state.error}</Alert>}
      <Field label="Current password" error={fe?.current}>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" error={fe?.password} hint="At least 10 characters with upper- and lowercase letters and a number.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm new password" error={fe?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Change password
      </Button>
    </form>
  );
}
