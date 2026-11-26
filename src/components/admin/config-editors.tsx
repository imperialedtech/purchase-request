"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Mail, Plus, Save, Trash2, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui";
import { createRoleAction, saveEntityAction, saveSettingsAction, saveWorkflowAction, sendTestEmailAction, setRolePermissionsAction } from "@/app/actions/admin";
import { STATUS_LABEL } from "@/lib/status";

function useRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error ?? "Error" });
      if (r.ok) router.refresh();
    });
  return { pending, msg, run };
}

// ───────────── Workflow ─────────────

type Stage = { name: string; statusKey: "PENDING_LEVEL1" | "PENDING_FINANCE" | "PENDING_FINAL" | "PENDING_APPROVAL"; approverType: "CATEGORY_APPROVER" | "ROLE" | "USER"; roleId: string | null; userId: string | null; requireCommentOnApprove: boolean; escalationHours: number | null };

export function WorkflowEditor({
  entity,
  workflow,
  roles,
  users,
}: {
  entity: { id: string; name: string; isConfigured: boolean };
  workflow: { id: string; name: string; resubmitRule: "RETURNING_STAGE" | "FIRST_STAGE"; isActive: boolean; version: number; stages: Stage[] } | null;
  roles: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const { pending, msg, run } = useRunner();
  const [wf, setWf] = useState(
    workflow ?? { id: "", name: `${entity.name} Approval`, resubmitRule: "RETURNING_STAGE" as const, isActive: true, version: 0, stages: [] as Stage[] },
  );
  const setStage = (i: number, patch: Partial<Stage>) => setWf({ ...wf, stages: wf.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const s = [...wf.stages];
    [s[i], s[i + d]] = [s[i + d]!, s[i]!];
    setWf({ ...wf, stages: s });
  };
  return (
    <Card>
      <CardHeader
        title={entity.name}
        description={workflow ? `Version ${workflow.version} · ${workflow.isActive ? "active" : "inactive"}` : "No workflow configured yet"}
        actions={!entity.isConfigured ? <Badge tone="amber">Entity not configured</Badge> : undefined}
      />
      <div className="space-y-4 p-5">
        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
        {!entity.isConfigured && (
          <Alert tone="amber">
            This entity&apos;s approval hierarchy has not been supplied. Do not configure stages until the official procedure is provided; requests cannot be raised until the entity is marked as configured.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Workflow name">
            <Input value={wf.name} onChange={(e) => setWf({ ...wf, name: e.target.value })} />
          </Field>
          <Field label="After clarification, resubmitted requests go to" hint="Applies to requests submitted after this change">
            <Select value={wf.resubmitRule} onChange={(e) => setWf({ ...wf, resubmitRule: e.target.value as Stage["statusKey"] & "RETURNING_STAGE" })}>
              <option value="RETURNING_STAGE">The stage that returned it</option>
              <option value="FIRST_STAGE">Level 1 (restart approvals)</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Checkbox checked={wf.isActive} onChange={(e) => setWf({ ...wf, isActive: e.target.checked })} label="Active workflow for this entity" />
          </div>
        </div>
        <ol className="space-y-3">
          {wf.stages.map((s, i) => (
            <li key={i} className="rounded-md border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Level {i + 1}</span>
                <div className="flex gap-1">
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={i === wf.stages.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setWf({ ...wf, stages: wf.stages.filter((_, j) => j !== i) })} aria-label="Remove stage">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Stage name">
                  <Input value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} />
                </Field>
                <Field label="Status while pending">
                  <Select value={s.statusKey} onChange={(e) => setStage(i, { statusKey: e.target.value as Stage["statusKey"] })}>
                    {(["PENDING_LEVEL1", "PENDING_FINANCE", "PENDING_FINAL", "PENDING_APPROVAL"] as const).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Approver">
                  <Select value={s.approverType} onChange={(e) => setStage(i, { approverType: e.target.value as Stage["approverType"] })}>
                    <option value="CATEGORY_APPROVER">Category&apos;s Level 1 approver</option>
                    <option value="ROLE">Any user with a role</option>
                    <option value="USER">A specific user</option>
                  </Select>
                </Field>
                {s.approverType === "ROLE" && (
                  <Field label="Role">
                    <Select value={s.roleId ?? ""} onChange={(e) => setStage(i, { roleId: e.target.value || null })}>
                      <option value="">Select role…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {s.approverType === "USER" && (
                  <Field label="User">
                    <Select value={s.userId ?? ""} onChange={(e) => setStage(i, { userId: e.target.value || null })}>
                      <option value="">Select user…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Escalation (hours)" hint="Flags overdue items">
                  <Input type="number" min={1} value={s.escalationHours ?? ""} onChange={(e) => setStage(i, { escalationHours: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <div className="flex items-end">
                  <Checkbox checked={s.requireCommentOnApprove} onChange={(e) => setStage(i, { requireCommentOnApprove: e.target.checked })} label="Comment required to approve" />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="secondary"
            disabled={wf.stages.length >= 10}
            onClick={() => setWf({ ...wf, stages: [...wf.stages, { name: "", statusKey: "PENDING_APPROVAL", approverType: "ROLE", roleId: null, userId: null, requireCommentOnApprove: false, escalationHours: null }] })}
          >
            <Plus className="h-4 w-4" /> Add stage
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (workflow && !confirm("Save workflow changes? Requests already submitted keep their original approval routing.")) return;
              run(() => saveWorkflowAction(workflow?.id ?? null, { entityId: entity.id, name: wf.name, resubmitRule: wf.resubmitRule, isActive: wf.isActive, stages: wf.stages }));
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save workflow
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ───────────── Entity ─────────────

type EntityForm = {
  id: string | null;
  code: string;
  name: string;
  legalName: string;
  address: string;
  prNumberFormat: string;
  sequencePadding: number;
  currencyMode: "SINGLE" | "MULTI";
  defaultCurrency: string;
  allowedCurrencies: string[];
  allowSelfApproval: boolean;
  emailNotifications: boolean;
  pdfFooterText: string;
  isActive: boolean;
  isConfigured: boolean;
  hasLogo?: boolean;
};

const ALL_CURRENCIES = ["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR", "CAD", "AED"];

export function EntityEditor({ initial }: { initial: EntityForm }) {
  const { pending, msg, run } = useRunner();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const preview = f.prNumberFormat.replace("{CODE}", f.code || "CODE").replace("{YEAR}", String(new Date().getFullYear())).replace("{SEQ}", "1".padStart(f.sequencePadding, "0"));
  return (
    <Card>
      <CardHeader title={f.id ? `${initial.name} (${initial.code})` : "New entity"} actions={f.isConfigured ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>} />
      <div className="space-y-5 p-5">
        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Entity name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Entity code" required hint="Used in PR numbers">
            <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={10} />
          </Field>
          <Field label="Legal name">
            <Input value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} />
          </Field>
          <Field label="Address">
            <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="PR number format" hint={`Preview: ${preview}`}>
            <Input value={f.prNumberFormat} onChange={(e) => setF({ ...f, prNumberFormat: e.target.value })} />
          </Field>
          <Field label="Sequence digits">
            <Input type="number" min={3} max={8} value={f.sequencePadding} onChange={(e) => setF({ ...f, sequencePadding: Number(e.target.value) })} />
          </Field>
          <Field label="Currency rule">
            <Select value={f.currencyMode} onChange={(e) => setF({ ...f, currencyMode: e.target.value as "SINGLE" })}>
              <option value="SINGLE">Single currency per PR</option>
              <option value="MULTI">Mixed currencies (totals per currency)</option>
            </Select>
          </Field>
          <Field label="Default currency">
            <Select value={f.defaultCurrency} onChange={(e) => setF({ ...f, defaultCurrency: e.target.value })}>
              {f.allowedCurrencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Allowed currencies" group>
          <div className="flex flex-wrap gap-4">
            {ALL_CURRENCIES.map((c) => (
              <Checkbox
                key={c}
                checked={f.allowedCurrencies.includes(c)}
                onChange={(e) => setF({ ...f, allowedCurrencies: e.target.checked ? [...f.allowedCurrencies, c] : f.allowedCurrencies.filter((x) => x !== c) })}
                label={c}
              />
            ))}
          </div>
        </Field>
        <Field label="PDF footer text">
          <Input value={f.pdfFooterText} onChange={(e) => setF({ ...f, pdfFooterText: e.target.value })} maxLength={300} />
        </Field>
        <div className="flex flex-wrap gap-6">
          <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label="Active" />
          <Checkbox checked={f.isConfigured} onChange={(e) => setF({ ...f, isConfigured: e.target.checked })} label="Configured — users may raise purchase requests" />
          <Checkbox checked={f.emailNotifications} onChange={(e) => setF({ ...f, emailNotifications: e.target.checked })} label="Send email notifications" />
          <Checkbox
            checked={f.allowSelfApproval}
            onChange={(e) => {
              if (e.target.checked && !confirm("Allow approvers to approve their own requests in this entity? This weakens segregation of duties and is logged.")) return;
              setF({ ...f, allowSelfApproval: e.target.checked });
            }}
            label="Allow self-approval (not recommended)"
          />
        </div>
        {f.id && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3">
            {f.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/entities/${f.id}/logo?v=${logoVersion}`} alt={`${f.name} logo`} className="h-10 max-w-[180px] rounded bg-surface object-contain p-1 ring-1 ring-slate-200" />
            ) : (
              <span className="text-xs text-slate-500">No logo uploaded{f.code === "IET" ? " — the default Imperial EdTech logo is used on PDFs" : ""}.</span>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Upload logo (PNG/JPG, max 1 MB)
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  const r = await fetch(`/api/entities/${f.id}/logo`, { method: "POST", body: fd });
                  const j = await r.json().catch(() => ({}));
                  setLogoMsg(r.ok ? "Logo updated" : (j.error ?? "Upload failed"));
                  if (r.ok) {
                    setF({ ...f, hasLogo: true });
                    setLogoVersion((v) => v + 1);
                    router.refresh();
                  }
                }}
              />
            </label>
            {logoMsg && <span className="text-xs text-slate-600">{logoMsg}</span>}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() => {
              const { id, hasLogo: _h, ...rest } = f;
              void _h;
              run(() => saveEntityAction(id, rest));
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save entity
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ───────────── Roles & permissions ─────────────

export function RoleMatrix({ roles, permissions, canEdit }: { roles: { id: string; key: string; name: string; isSystem: boolean; users: number; perms: string[] }[]; permissions: { key: string; description: string }[]; canEdit: boolean }) {
  const { pending, msg, run } = useRunner();
  const [state, setState] = useState(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.perms)])));
  const [newRole, setNewRole] = useState({ key: "", name: "", description: "" });
  const toggle = (roleId: string, key: string) => {
    const s = new Set(state[roleId]);
    if (s.has(key)) s.delete(key);
    else s.add(key);
    setState({ ...state, [roleId]: s });
  };
  return (
    <div className="space-y-6">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-500">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[110px] px-2 py-3 text-center text-xs font-semibold text-slate-700">
                  {r.name}
                  <span className="block font-normal text-slate-400">{r.users} user(s)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key} className="border-b border-slate-100">
                <td className="sticky left-0 bg-surface px-4 py-2.5">
                  <p className="font-mono text-xs text-slate-900">{p.key}</p>
                  <p className="text-xs text-slate-500">{p.description}</p>
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={state[r.id]!.has(p.key)}
                      disabled={!canEdit}
                      onChange={() => toggle(r.id, p.key)}
                      aria-label={`${r.name}: ${p.key}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {canEdit && (
            <tfoot>
              <tr>
                <td className="sticky left-0 bg-surface px-4 py-3 text-xs text-slate-500">Save changes per role</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 py-3 text-center">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setRolePermissionsAction(r.id, [...state[r.id]!]))}>
                      Save
                    </Button>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      {canEdit && (
        <Card>
          <CardHeader title="Create role" description="Custom roles can be used in workflows (e.g. a future PAVE approver role)." />
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <Field label="Key">
              <Input value={newRole.key} onChange={(e) => setNewRole({ ...newRole, key: e.target.value.toUpperCase() })} placeholder="PAVE_DIRECTOR" />
            </Field>
            <Field label="Name">
              <Input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button disabled={pending || !newRole.key || !newRole.name} onClick={() => run(() => createRoleAction(newRole))}>
                <Plus className="h-4 w-4" /> Create role
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────── System settings ─────────────

function TestEmailButton({ disabled }: { disabled: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 pt-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await sendTestEmailAction();
            setMsg(r.ok ? { ok: true, text: r.message ?? "Sent" } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send test email to me
      </Button>
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
    </div>
  );
}

export function SettingsEditor({ initial, email }: { initial: { appName: string; companyName: string; supportEmail: string; pdfShowComments: boolean; overdueHighlightHours: number }; email: { configured: boolean; host: string | null; from: string | null } }) {
  const { pending, msg, run } = useRunner();
  const [f, setF] = useState(initial);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader title="Application" />
        <div className="space-y-4 p-5">
          {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application name">
              <Input value={f.appName} onChange={(e) => setF({ ...f, appName: e.target.value })} />
            </Field>
            <Field label="Company name (reports)">
              <Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
            </Field>
            <Field label="Support contact email">
              <Input value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} />
            </Field>
            <Field label="Flag approvals as overdue after (hours)" hint="Default when a stage has no escalation hours">
              <Input type="number" min={1} value={f.overdueHighlightHours} onChange={(e) => setF({ ...f, overdueHighlightHours: Number(e.target.value) })} />
            </Field>
          </div>
          <Checkbox checked={f.pdfShowComments} onChange={(e) => setF({ ...f, pdfShowComments: e.target.checked })} label="Include the comments / business justification section on PR PDFs" />
          <div className="flex justify-end">
            <Button disabled={pending} onClick={() => run(() => saveSettingsAction(f))}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </Button>
          </div>
        </div>
      </Card>
      <Card className="self-start">
        <CardHeader title="Email delivery" />
        <div className="space-y-2 p-5 text-sm">
          <p>
            Status: <b>{email.configured ? "Configured" : "Not configured"}</b>
          </p>
          {email.configured && (
            <p className="text-xs text-slate-500">
              {email.host} · from {email.from}
            </p>
          )}
          <p className="text-xs text-slate-500">SMTP credentials are managed through environment variables (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) and are never stored in the database. In-app notifications always work.</p>
          <TestEmailButton disabled={!email.configured} />
        </div>
      </Card>
    </div>
  );
}
