"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { saveCategoryAction, saveDepartmentAction } from "@/app/actions/admin";

type Ent = { id: string; name: string; code: string };

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error ?? "Error" });
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}

// ───────────── Departments ─────────────

type Dept = { id: string; entityId: string; name: string; code: string | null; isActive: boolean; users: number };

export function DepartmentManager({ entities, departments }: { entities: Ent[]; departments: Dept[] }) {
  const { pending, msg, run } = useSaver();
  const blank = { id: null as string | null, entityId: entities[0]?.id ?? "", name: "", code: "", isActive: true };
  const [edit, setEdit] = useState(blank);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Department</Th>
              {entities.length > 1 && <Th>Entity</Th>}
              <Th>Code</Th>
              <Th>Users</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <Td className="font-medium text-slate-900">{d.name}</Td>
                {entities.length > 1 && <Td>{entities.find((e) => e.id === d.entityId)?.code}</Td>}
                <Td>{d.code ?? "—"}</Td>
                <Td>{d.users}</Td>
                <Td>{d.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</Td>
                <Td className="text-right">
                  <button className="text-slate-400 hover:text-brand-700" onClick={() => setEdit({ id: d.id, entityId: d.entityId, name: d.name, code: d.code ?? "", isActive: d.isActive })} aria-label={`Edit ${d.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="self-start">
        <CardHeader title={edit.id ? "Edit department" : "Add department"} actions={edit.id ? <Button size="sm" variant="ghost" onClick={() => setEdit(blank)}><Plus className="h-3.5 w-3.5" /> New</Button> : undefined} />
        <div className="space-y-4 p-5">
          {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
          {entities.length > 1 && (
            <Field label="Entity">
              <Select value={edit.entityId} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, entityId: e.target.value })}>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name" required>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Code">
            <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} maxLength={20} />
          </Field>
          <Checkbox checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} label="Active (deactivated departments cannot be assigned)" />
          <Button disabled={pending} onClick={() => run(() => saveDepartmentAction(edit.id, edit), () => setEdit(blank))}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save department
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ───────────── Categories ─────────────

type Cat = { id: string; entityId: string; name: string; description: string | null; level1ApproverId: string | null; level1Label: string | null; isActive: boolean; approverName: string | null; requests: number };

export function CategoryManager({ entities, categories, approvers }: { entities: Ent[]; categories: Cat[]; approvers: { id: string; name: string; jobTitle: string | null; entityIds: string[] }[] }) {
  const { pending, msg, run } = useSaver();
  const blank = { id: null as string | null, entityId: entities[0]?.id ?? "", name: "", description: "", level1ApproverId: "", level1Label: "", isActive: true };
  const [edit, setEdit] = useState(blank);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              {entities.length > 1 && <Th>Entity</Th>}
              <Th>Level 1 approver (functional responsible)</Th>
              <Th>PRs</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <Td>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </Td>
                {entities.length > 1 && <Td>{entities.find((e) => e.id === c.entityId)?.code}</Td>}
                <Td>
                  {c.approverName ? (
                    <>
                      {c.approverName}
                      <p className="text-xs text-slate-500">{c.level1Label}</p>
                    </>
                  ) : (
                    <Badge tone="amber">Not assigned</Badge>
                  )}
                </Td>
                <Td>{c.requests}</Td>
                <Td>{c.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</Td>
                <Td className="text-right">
                  <button
                    className="text-slate-400 hover:text-brand-700"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => setEdit({ id: c.id, entityId: c.entityId, name: c.name, description: c.description ?? "", level1ApproverId: c.level1ApproverId ?? "", level1Label: c.level1Label ?? "", isActive: c.isActive })}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="self-start">
        <CardHeader title={edit.id ? "Edit category" : "Add category"} actions={edit.id ? <Button size="sm" variant="ghost" onClick={() => setEdit(blank)}><Plus className="h-3.5 w-3.5" /> New</Button> : undefined} />
        <div className="space-y-4 p-5">
          {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
          {entities.length > 1 && (
            <Field label="Entity">
              <Select value={edit.entityId} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, entityId: e.target.value, level1ApproverId: "" })}>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name" required>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </Field>
          <Field label="Level 1 approver" hint="Must hold an approver role. Changes apply to new submissions only.">
            <Select value={edit.level1ApproverId} onChange={(e) => setEdit({ ...edit, level1ApproverId: e.target.value })}>
              <option value="">— Not assigned —</option>
              {approvers
                .filter((a) => a.entityIds.includes(edit.entityId))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.jobTitle ? ` — ${a.jobTitle}` : ""}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Functional responsible label" hint="e.g. Purchasing Officer, System Administrator">
            <Input value={edit.level1Label} onChange={(e) => setEdit({ ...edit, level1Label: e.target.value })} />
          </Field>
          <Checkbox checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} label="Active" />
          <Button disabled={pending} onClick={() => run(() => saveCategoryAction(edit.id, { ...edit, level1ApproverId: edit.level1ApproverId || null }), () => setEdit(blank))}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save category
          </Button>
        </div>
      </Card>
    </div>
  );
}
