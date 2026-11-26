"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, FileUp, Loader2, Paperclip, Plus, Save, Send, Trash2 } from "lucide-react";
import { Alert, Button, Card, Checkbox, Field, Input, LinkButton, Select, Textarea, buttonClass } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { formatMoney, lineTotal, totalsByCurrency } from "@/lib/money";
import { saveDraftAction, submitAction, removeAttachmentAction } from "@/app/actions/requests";

type EntityOption = {
  id: string;
  code: string;
  name: string;
  isConfigured: boolean;
  currencyMode: "SINGLE" | "MULTI";
  defaultCurrency: string;
  allowedCurrencies: string[];
  categories: { id: string; name: string; level1Label: string | null }[];
};

type Item = { key: string; description: string; specifications: string; quantity: string; currency: string; unitPrice: string };

export type RequestFormProps = {
  entities: EntityOption[];
  initiator: { name: string; jobTitle: string | null; department: string | null; canEditProfile: boolean };
  existing?: {
    id: string;
    prNumber: string | null;
    status: string;
    entityId: string;
    categoryId: string | null;
    title: string;
    comments: string;
    paymentDetails: string | null;
    createdAt: string;
    items: { description: string; specifications: string | null; quantity: string; currency: string; unitPrice: string }[];
    attachments: { id: string; fileName: string; sizeBytes: number; mimeType: string }[];
    clarification?: { by: string; stage: string; comment: string; at: string } | null;
  };
  maxUploadMb: number;
};

const STEPS = ["Request information", "Business justification", "Purchase items", "Supporting documents", "Review & submit"];
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

export function RequestForm({ entities, initiator, existing, maxUploadMb }: RequestFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [id, setId] = useState(existing?.id);
  const [entityId, setEntityId] = useState(existing?.entityId ?? entities.find((e) => e.isConfigured)?.id ?? entities[0]?.id ?? "");
  const entity = entities.find((e) => e.id === entityId);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [title, setTitle] = useState(existing?.title === "Untitled request" ? "" : (existing?.title ?? ""));
  const [comments, setComments] = useState(existing?.comments ?? "");
  const [paymentDetails, setPaymentDetails] = useState(existing?.paymentDetails ?? "");
  const [items, setItems] = useState<Item[]>(
    existing?.items.length
      ? existing.items.map((i) => ({ key: newKey(), description: i.description, specifications: i.specifications ?? "", quantity: i.quantity, currency: i.currency, unitPrice: i.unitPrice }))
      : [{ key: newKey(), description: "", specifications: "", quantity: "1", currency: entity?.defaultCurrency ?? "NGN", unitPrice: "" }],
  );
  const [attachments, setAttachments] = useState(existing?.attachments ?? []);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<{ id: string; prNumber: string; stageName: string; approverNames: string[]; status: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const touch = () => setDirty(true);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !done) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, done]);

  const singleCurrency = entity?.currencyMode !== "MULTI";
  const validItems = items.filter((i) => /^\d+(\.\d+)?$/.test(i.quantity) && /^\d+(\.\d{1,2})?$/.test(i.unitPrice));
  const totals = useMemo(() => totalsByCurrency(validItems), [validItems]);

  const input = () => ({
    entityId,
    title: title.trim(),
    categoryId: categoryId || null,
    comments,
    paymentDetails,
    items: items
      .filter((i) => i.description.trim() || i.unitPrice.trim())
      .map((i) => ({ description: i.description, specifications: i.specifications, quantity: i.quantity.trim(), currency: i.currency, unitPrice: i.unitPrice.replace(/,/g, "").trim() })),
  });

  function updateItem(key: string, patch: Partial<Item>) {
    touch();
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return singleCurrency && patch.currency ? { ...it, currency: patch.currency } : it;
        return { ...it, ...patch };
      }),
    );
  }

  async function save(silent = false): Promise<string | undefined> {
    setMessage(null);
    const r = await saveDraftAction(input(), id);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setMessage({ tone: "red", text: r.error });
      return undefined;
    }
    setErrors({});
    setDirty(false);
    const newId = r.data!.id;
    if (!id) {
      setId(newId);
      window.history.replaceState(null, "", `/requests/${newId}/edit`);
    }
    if (!silent) setMessage({ tone: "green", text: "Draft saved" });
    return newId;
  }

  function stepErrors(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!entity?.isConfigured) e.entityId = "This entity is not yet configured for purchase requests";
      if (!categoryId) e.categoryId = "Select a purchase category";
      if (title.trim().length < 3) e.title = "Enter a short summary (min. 3 characters)";
    }
    if (s === 1 && comments.trim().length < 10) e.comments = "Provide the purpose / business justification (min. 10 characters)";
    if (s === 2) {
      const used = input().items;
      if (used.length === 0) e.items = "Add at least one line item";
      items.forEach((it, i) => {
        if (!it.description.trim() && !it.unitPrice.trim()) return;
        if (it.description.trim().length < 2) e[`items.${i}.description`] = "Required";
        if (!/^\d{1,10}(\.\d{1,3})?$/.test(it.quantity.trim()) || Number(it.quantity) <= 0) e[`items.${i}.quantity`] = "Invalid";
        if (!/^\d{1,15}(\.\d{1,2})?$/.test(it.unitPrice.replace(/,/g, "").trim())) e[`items.${i}.unitPrice`] = "Invalid";
      });
    }
    return e;
  }

  function goTo(target: number) {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = stepErrors(s);
        if (Object.keys(e).length) {
          setErrors(e);
          setStep(s);
          setMessage({ tone: "red", text: Object.values(e)[0]! });
          return;
        }
      }
    }
    setErrors({});
    setMessage(null);
    if (target === 3 && (!id || dirty)) {
      start(async () => {
        const saved = await save(true);
        if (saved) setStep(3);
      });
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let currentId = id;
    if (!currentId || dirty) currentId = await save(true);
    if (!currentId) return;
    setUploading(true);
    setMessage(null);
    for (const f of Array.from(files)) {
      if (f.size > maxUploadMb * 1024 * 1024) {
        setMessage({ tone: "red", text: `${f.name} exceeds ${maxUploadMb} MB` });
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/requests/${currentId}/attachments`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ tone: "red", text: j.error ?? `Upload failed for ${f.name}` });
      else setAttachments((a) => [...a, j.attachment]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    start(async () => {
      const r = await submitAction(input(), id, confirmed);
      dialogRef.current?.close();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMessage({ tone: "red", text: r.error });
        return;
      }
      setDirty(false);
      setDone(r.data!);
      // The confirmation (PR number, status, next approver) is shown on the request page.
      router.replace(`/requests/${r.data!.id}?submitted=1`);
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Purchase request submitted</h2>
        <p className="mt-1 text-sm text-slate-500">Your request has been recorded and routed for approval.</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-left text-sm">
          <div>
            <dt className="text-xs text-slate-500">PR number</dt>
            <dd className="font-semibold text-slate-900">{done.prNumber}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">Pending {done.stageName} approval</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Next approver</dt>
            <dd className="font-medium text-slate-900">
              {done.stageName}
              {done.approverNames.length ? ` — ${done.approverNames.join(", ")}` : ""}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-center gap-2">
          <LinkButton href={`/requests/${done.id}`}>View request</LinkButton>
          {/* full navigation so the form starts from a clean state */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/requests/new" className={buttonClass("secondary")}>
            New request
          </a>
        </div>
      </Card>
    );
  }

  const isReturned = existing?.status === "RETURNED";
  const cat = entity?.categories.find((c) => c.id === categoryId);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* stepper */}
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Form steps">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                i === step ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-emerald-100 text-emerald-700" : i === step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0 space-y-4">
        {isReturned && existing?.clarification && (
          <Alert tone="amber" title={`Clarification requested by ${existing.clarification.by} (${existing.clarification.stage})`}>
            <p className="whitespace-pre-wrap">{existing.clarification.comment}</p>
            <p className="mt-1 text-xs">Update the request as needed and resubmit. The previous version is kept in the request history.</p>
          </Alert>
        )}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <Card className="p-5 sm:p-6">
          {step === 0 && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-slate-900">Section 1 — Initiator</h3>
                <p className="mt-0.5 text-xs text-slate-500">Taken from your authenticated profile{initiator.canEditProfile ? "; update it in Settings" : "; contact the administrator to change it"}.</p>
                <dl className="mt-3 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs text-slate-500">Requestor name</dt>
                    <dd className="font-medium">{initiator.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Job title</dt>
                    <dd className="font-medium">{initiator.jobTitle ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Department</dt>
                    <dd className="font-medium">{initiator.department ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Request date</dt>
                    <dd className="font-medium">{fmtDate(existing?.createdAt ?? new Date())}</dd>
                  </div>
                </dl>
              </section>
              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="Entity" htmlFor="entity" required error={errors.entityId}>
                  <Select
                    id="entity"
                    value={entityId}
                    disabled={!!id}
                    onChange={(e) => {
                      touch();
                      setEntityId(e.target.value);
                      setCategoryId("");
                      const ne = entities.find((x) => x.id === e.target.value);
                      if (ne) setItems((p) => p.map((i) => ({ ...i, currency: ne.defaultCurrency })));
                    }}
                  >
                    {entities.map((e) => (
                      <option key={e.id} value={e.id} disabled={!e.isConfigured}>
                        {e.name} ({e.code}){e.isConfigured ? "" : " — not yet configured"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Purchase category" htmlFor="category" required error={errors.categoryId} hint={cat?.level1Label ? `Level 1 approval: ${cat.level1Label}` : undefined}>
                  <Select
                    id="category"
                    value={categoryId}
                    aria-invalid={!!errors.categoryId}
                    onChange={(e) => {
                      touch();
                      setCategoryId(e.target.value);
                    }}
                  >
                    <option value="">Select category…</option>
                    {entity?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Request summary" htmlFor="title" required error={errors.title} className="sm:col-span-2" hint="A short title shown in lists, e.g. “Laptops for new operations staff”.">
                  <Input
                    id="title"
                    value={title}
                    maxLength={200}
                    aria-invalid={!!errors.title}
                    onChange={(e) => {
                      touch();
                      setTitle(e.target.value);
                    }}
                  />
                </Field>
              </section>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Section 2 — Comments</h3>
                <p className="mt-0.5 text-xs text-slate-500">Explain the purpose of the purchase, the business justification and any other relevant details.</p>
              </div>
              <Field label="Purpose / business justification" htmlFor="comments" required error={errors.comments}>
                <Textarea
                  id="comments"
                  rows={9}
                  maxLength={10000}
                  value={comments}
                  aria-invalid={!!errors.comments}
                  onChange={(e) => {
                    touch();
                    setComments(e.target.value);
                  }}
                  placeholder="What is being purchased, why it is needed, the impact if not purchased, preferred vendor, timelines…"
                />
              </Field>
              <Field
                label="Payment details (restricted)"
                htmlFor="payment"
                hint="Optional. Vendor bank/payment details are visible only to you, the assigned approvers and authorised finance staff."
              >
                <Textarea
                  id="payment"
                  rows={3}
                  maxLength={4000}
                  value={paymentDetails}
                  onChange={(e) => {
                    touch();
                    setPaymentDetails(e.target.value);
                  }}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Section 3 — Description of purchase</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Prices are VAT inclusive. {singleCurrency ? "All items must use the same currency." : "Totals are shown separately per currency."}
                  </p>
                </div>
              </div>
              {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}
              <div className="space-y-3">
                {items.map((it, i) => {
                  const lt = /^\d+(\.\d+)?$/.test(it.quantity) && /^\d+(\.\d{1,2})?$/.test(it.unitPrice.replace(/,/g, "")) ? lineTotal(it.quantity, it.unitPrice.replace(/,/g, "")) : null;
                  return (
                    <div key={it.key} className="rounded-md border border-slate-200 p-3 sm:p-4">
                      <div className="grid gap-3 sm:grid-cols-12">
                        <Field label={`Item ${i + 1} — description`} className="sm:col-span-12 lg:col-span-5" error={errors[`items.${i}.description`]}>
                          <Input aria-label={`Item ${i + 1} description`} value={it.description} maxLength={500} onChange={(e) => updateItem(it.key, { description: e.target.value })} aria-invalid={!!errors[`items.${i}.description`]} />
                        </Field>
                        <Field label="Quantity" className="sm:col-span-3 lg:col-span-1" error={errors[`items.${i}.quantity`]}>
                          <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })} aria-invalid={!!errors[`items.${i}.quantity`]} />
                        </Field>
                        <Field label="Currency" className="sm:col-span-3 lg:col-span-2">
                          <Select aria-label={`Item ${i + 1} currency`} value={it.currency} onChange={(e) => updateItem(it.key, { currency: e.target.value })}>
                            {entity?.allowedCurrencies.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Unit price (VAT incl.)" className="sm:col-span-3 lg:col-span-2" error={errors[`items.${i}.unitPrice`]}>
                          <Input aria-label={`Item ${i + 1} unit price`} inputMode="decimal" value={it.unitPrice} placeholder="0.00" onChange={(e) => updateItem(it.key, { unitPrice: e.target.value })} aria-invalid={!!errors[`items.${i}.unitPrice`]} />
                        </Field>
                        <div className="sm:col-span-3 lg:col-span-2">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Total (VAT incl.)</span>
                          <div className="flex h-9 items-center justify-between gap-2 rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-900">
                            <span className="truncate">{lt ? formatMoney(lt.toFixed(2)) : "—"}</span>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                              disabled={items.length === 1}
                              onClick={() => {
                                touch();
                                setItems((p) => p.filter((x) => x.key !== it.key));
                              }}
                              aria-label={`Remove item ${i + 1}`}
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <Field label="Specifications / notes (optional)" className="sm:col-span-12">
                          <Input aria-label={`Item ${i + 1} specifications`} value={it.specifications} maxLength={2000} onChange={(e) => updateItem(it.key, { specifications: e.target.value })} placeholder="Model, size, vendor, link…" />
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={items.length >= 100}
                  onClick={() => {
                    touch();
                    setItems((p) => [...p, { key: newKey(), description: "", specifications: "", quantity: "1", currency: p[0]?.currency ?? entity?.defaultCurrency ?? "NGN", unitPrice: "" }]);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add line item
                </Button>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Grand total (VAT inclusive)</p>
                  {Object.entries(totals).length === 0 ? (
                    <p className="text-lg font-semibold">—</p>
                  ) : (
                    Object.entries(totals).map(([c, v]) => (
                      <p key={c} className="text-lg font-semibold text-slate-900">
                        {formatMoney(v, c)}
                      </p>
                    ))
                  )}
                  <p className="text-[11px] text-slate-400">Final totals are recalculated by the server.</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Supporting documents</h3>
                <p className="mt-0.5 text-xs text-slate-500">Quotations, invoices, proposals, screenshots or specifications. PDF, images, Word, Excel, PowerPoint, CSV or text · max {maxUploadMb} MB each.</p>
              </div>
              <label className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-brand-500 hover:bg-brand-50/40", uploading && "pointer-events-none opacity-60")}>
                {uploading ? <Loader2 className="h-8 w-8 animate-spin text-brand-600" /> : <FileUp className="h-8 w-8 text-slate-400" />}
                <span className="mt-2 text-sm font-medium text-slate-700">{uploading ? "Uploading…" : "Choose files to upload"}</span>
                <input ref={fileRef} type="file" multiple className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.csv,.txt" onChange={(e) => upload(e.target.files)} />
              </label>
              {attachments.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                      <a href={`/api/attachments/${a.id}`} className="min-w-0 flex-1 truncate text-brand-700 hover:underline">
                        {a.fileName}
                      </a>
                      <span className="text-xs text-slate-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${a.fileName}`}
                        onClick={() =>
                          start(async () => {
                            const r = await removeAttachmentAction(a.id);
                            if (r.ok) setAttachments((x) => x.filter((y) => y.id !== a.id));
                            else setMessage({ tone: "red", text: r.error });
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h3 className="text-sm font-semibold text-slate-900">Review &amp; submit</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">Entity</dt>
                  <dd className="font-medium">{entity?.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Category</dt>
                  <dd className="font-medium">{cat?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Requestor</dt>
                  <dd className="font-medium">
                    {initiator.name} · {initiator.department ?? "—"}
                  </dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-xs text-slate-500">Summary</dt>
                  <dd className="font-medium">{title || "—"}</dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-xs text-slate-500">Business justification</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">{comments || "—"}</dd>
                </div>
              </dl>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-left font-medium">Currency</th>
                      <th className="px-3 py-2 text-right font-medium">Unit price</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {input().items.map((it, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{it.description}</td>
                        <td className="px-3 py-2 text-right">{it.quantity}</td>
                        <td className="px-3 py-2">{it.currency}</td>
                        <td className="px-3 py-2 text-right">{/^\d+(\.\d+)?$/.test(it.unitPrice) ? formatMoney(it.unitPrice) : it.unitPrice}</td>
                        <td className="px-3 py-2 text-right font-medium">{/^\d+(\.\d+)?$/.test(it.unitPrice) && /^\d+(\.\d+)?$/.test(it.quantity) ? formatMoney(lineTotal(it.quantity, it.unitPrice).toFixed(2)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {Object.entries(totals).map(([c, v]) => (
                      <tr key={c} className="border-t border-slate-200 bg-slate-50">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">
                          Grand total ({c})
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(v, c)}</td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-slate-500">{attachments.length} supporting document(s) attached.</p>
              <Checkbox
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                label={
                  <>
                    I, <b>{initiator.name}</b>, confirm that this purchase request is accurate, required for company business, and is submitted by me.
                  </>
                }
              />
            </div>
          )}
        </Card>

        <div className="no-print sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button type="button" variant="secondary" onClick={() => goTo(step - 1)}>
                Back
              </Button>
            )}
            <Button type="button" variant="ghost" disabled={pending || !entity?.isConfigured} onClick={() => start(async () => void (await save()))}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
            </Button>
            {dirty && <span className="hidden text-xs text-amber-600 sm:inline">Unsaved changes</span>}
          </div>
          {step < 4 ? (
            <Button type="button" onClick={() => goTo(step + 1)} disabled={pending}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!confirmed || pending}
              onClick={() => {
                const all = { ...stepErrors(0), ...stepErrors(1), ...stepErrors(2) };
                if (Object.keys(all).length) {
                  setErrors(all);
                  setMessage({ tone: "red", text: Object.values(all)[0]! });
                  return;
                }
                dialogRef.current?.showModal();
              }}
            >
              <Send className="h-4 w-4" /> {isReturned ? "Resubmit request" : "Submit request"}
            </Button>
          )}
        </div>
      </div>

      <dialog ref={dialogRef} className="m-auto w-[min(92vw,440px)] rounded-lg p-0 shadow-xl">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h3 className="font-semibold text-slate-900">{isReturned ? "Resubmit" : "Submit"} purchase request?</h3>
              <p className="mt-1 text-sm text-slate-600">
                Once submitted, the request is locked and routed to {cat?.level1Label ?? "the functional responsible"} for Level 1 approval. You can only edit it again if an approver returns it for clarification.
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                Total: {Object.entries(totals).map(([c, v]) => formatMoney(v, c)).join(" + ") || "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" className={buttonClass("secondary")} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm &amp; submit
          </Button>
        </div>
      </dialog>
      {id && (
        <p className="text-xs text-slate-400 lg:col-start-2">
          Draft saved — <Link className="underline" href={`/requests/${id}`}>view draft</Link>
        </p>
      )}
    </div>
  );
}
