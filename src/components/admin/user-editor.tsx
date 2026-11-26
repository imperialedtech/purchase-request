"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Save, UserCheck, UserX } from "lucide-react";
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, LinkButton, Select } from "@/components/ui";
import { createUserAction, issueResetLinkAction, setUserActiveAction, updateUserAction } from "@/app/actions/admin";

type Opt = { id: string; name: string };
export type UserEditorProps = {
  user?: {
    id: string;
    email: string;
    name: string;
    jobTitle: string;
    phone: string;
    departmentId: string;
    canEditProfile: boolean;
    isActive: boolean;
    activated: boolean;
    entityIds: string[];
    roles: { roleId: string; entityId: string | null }[];
  };
  entities: (Opt & { code: string })[];
  departments: (Opt & { entityId: string })[];
  roles: (Opt & { key: string; description: string | null })[];
  isSelf: boolean;
};

export function UserEditor({ user, entities, departments, roles, isSelf }: UserEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: user?.name ?? "",
    jobTitle: user?.jobTitle ?? "",
    phone: user?.phone ?? "",
    departmentId: user?.departmentId ?? "",
    canEditProfile: user?.canEditProfile ?? false,
    entityIds: user?.entityIds ?? (entities.length === 1 ? [entities[0]!.id] : []),
  });
  // role grants: roleId -> scope ("" = all of the user's entities, or entityId)
  const [grants, setGrants] = useState<Record<string, string>>(() => Object.fromEntries((user?.roles ?? []).map((r) => [r.roleId, r.entityId ?? ""])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string; fieldErrors?: Record<string, string> } | null>(null);
  const [link, setLink] = useState<{ link: string; emailed: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);

  const payload = () => ({
    ...form,
    departmentId: form.departmentId || null,
    roles: Object.entries(grants).map(([roleId, scope]) => ({ roleId, entityId: scope || null })),
  });

  function save() {
    start(async () => {
      setMsg(null);
      if (user) {
        const r = await updateUserAction(user.id, payload());
        setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error, fieldErrors: r.fieldErrors });
        if (r.ok) router.refresh();
      } else {
        const r = await createUserAction(payload());
        if (r.ok) {
          setLink({ link: r.data!.link, emailed: r.data!.emailed });
          setMsg({ ok: true, text: "User created. Share the activation link below so they can set a password." });
          setCreatedId(r.data!.id);
        } else setMsg({ ok: false, text: r.error, fieldErrors: r.fieldErrors });
      }
    });
  }

  const fe = msg?.fieldErrors ?? {};
  const deptOptions = departments.filter((d) => form.entityIds.includes(d.entityId));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
        {link && (
          <Alert tone="blue" title={link.emailed ? "Activation email sent. You can also copy the link:" : "Email is not configured — copy this one-time link and send it to the user securely:"}>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs">{link.link}</code>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link.link)}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </Alert>
        )}
        <Card>
          <CardHeader title="Profile" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" required error={fe.name}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email" required error={fe.email}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Job title" error={fe.jobTitle}>
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Department">
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">— None —</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {entities.length > 1 ? ` (${entities.find((e) => e.id === d.entityId)?.code})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Checkbox checked={form.canEditProfile} onChange={(e) => setForm({ ...form, canEditProfile: e.target.checked })} label="User may edit own name and job title" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Entity access" description="Users only see records of entities they belong to." />
          <div className="flex flex-wrap gap-4 p-5">
            {entities.map((e) => (
              <Checkbox
                key={e.id}
                checked={form.entityIds.includes(e.id)}
                onChange={(ev) => setForm({ ...form, entityIds: ev.target.checked ? [...form.entityIds, e.id] : form.entityIds.filter((x) => x !== e.id) })}
                label={`${e.name} (${e.code})`}
              />
            ))}
            {fe.entityIds && <p className="w-full text-xs text-red-600">{fe.entityIds}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Roles" description="A user may hold several roles. Scope a role to one entity, or apply it to all of the user's entities." />
          <ul className="divide-y divide-slate-100">
            {roles.map((r) => {
              const on = r.id in grants;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Checkbox
                    className="min-w-0 flex-1"
                    checked={on}
                    onChange={(e) =>
                      setGrants((g) => {
                        const n = { ...g };
                        if (e.target.checked) n[r.id] = "";
                        else delete n[r.id];
                        return n;
                      })
                    }
                    label={
                      <span>
                        <span className="font-medium text-slate-900">{r.name}</span>
                        {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
                      </span>
                    }
                  />
                  {on && entities.length > 1 && (
                    <Select className="w-48" value={grants[r.id]} onChange={(e) => setGrants({ ...grants, [r.id]: e.target.value })} aria-label={`Scope of ${r.name}`}>
                      <option value="">All user&apos;s entities</option>
                      {entities
                        .filter((e) => form.entityIds.includes(e.id))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.code} only
                          </option>
                        ))}
                    </Select>
                  )}
                </li>
              );
            })}
          </ul>
          {fe.roles && <p className="px-5 pb-3 text-xs text-red-600">{fe.roles}</p>}
        </Card>
        <div className="flex justify-end gap-2">
          {createdId ? (
            <LinkButton href={`/admin/users/${createdId}`} variant="secondary">Open user record</LinkButton>
          ) : (
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {user ? "Save changes" : "Create user & generate invite"}
          </Button>
          )}
        </div>
      </div>

      {user && (
        <Card className="self-start">
          <CardHeader title="Account" />
          <div className="space-y-4 p-5 text-sm">
            <p>
              Status: <b>{!user.isActive ? "Deactivated" : user.activated ? "Active" : "Invited (password not set)"}</b>
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await issueResetLinkAction(user.id);
                  if (r.ok) setLink(r.data!);
                  else setMsg({ ok: false, text: r.error });
                })
              }
            >
              <KeyRound className="h-4 w-4" /> {user.activated ? "Generate password reset link" : "Re-send invitation link"}
            </Button>
            {!isSelf && (
              <Button
                variant={user.isActive ? "danger" : "success"}
                className="w-full"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (user.isActive && !confirm(`Deactivate ${user.name}? They will be signed out and unable to sign in.`)) return;
                    const r = await setUserActiveAction(user.id, !user.isActive);
                    setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
                    router.refresh();
                  })
                }
              >
                {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} {user.isActive ? "Deactivate user" : "Reactivate user"}
              </Button>
            )}
            <p className="text-xs text-slate-500">Users are never deleted, so their requests and approvals remain attributable.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
