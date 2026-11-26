"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction, setPasswordAction } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, activated }: { next?: string; activated?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      {activated && !state && <Alert tone="green">Your password has been set. You can now sign in.</Alert>}
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
      </Button>
      <p className="text-center text-xs text-slate-500">Forgot your password? Ask your system administrator for a reset link.</p>
    </form>
  );
}

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" error={fe?.password} hint="At least 10 characters with upper- and lowercase letters and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fe?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Set password
      </Button>
    </form>
  );
}
