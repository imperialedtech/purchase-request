"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mail, MessagesSquare, SendHorizontal } from "lucide-react";
import { commentAction } from "@/app/actions/requests";
import { cn, initials } from "@/lib/utils";
import type { ChatMessage } from "@/server/services/chat";

const POLL_MS = 8000;

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Live discussion for a purchase request. Everyone who can see the request can read it; the
 * requestor and approvers are notified in-app and by email for each new message.
 */
export function RequestChat({ requestId, meId, initial, canPost, placeholder, emailEnabled }: { requestId: string; meId: string; initial: ChatMessage[]; canPost: boolean; placeholder?: string; emailEnabled: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastAt = useRef(initial.at(-1)?.createdAt ?? null);
  const stick = useRef(true);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastAt.current = next.at(-1)?.createdAt ?? lastAt.current;
      return next;
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/messages${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store" });
      if (res.ok) merge(((await res.json()) as { messages: ChatMessage[] }).messages);
    } catch {
      /* offline: try again on the next tick */
    }
  }, [requestId, merge]);

  useEffect(() => {
    void poll(); // also marks this conversation as read
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // keep the view pinned to the newest message unless the user has scrolled up to read history
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send() {
    const text = body.trim();
    if (!text || pending) return;
    start(async () => {
      const r = await commentAction(requestId, text);
      if (r.ok) {
        setBody("");
        setError(null);
        stick.current = true;
        await poll();
        input.current?.focus();
      } else setError(r.error);
    });
  }

  const people = [...new Map(messages.map((m) => [m.authorId, m.authorName])).entries()];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessagesSquare className="h-4 w-4 text-brand-500" /> Discussion
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200 ring-inset">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Chat with the requestor and approvers about this request</p>
        </div>
        {people.length > 0 && (
          <div className="flex -space-x-2" aria-label={`${people.length} participant${people.length === 1 ? "" : "s"}`}>
            {people.slice(0, 5).map(([id, name]) => (
              <span key={id} title={name} className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-surface", id === meId ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-800")}>
                {initials(name)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="max-h-[30rem] min-h-48 space-y-3 overflow-y-auto bg-canvas/40 px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <MessagesSquare className="h-7 w-7 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">No messages yet</p>
            <p className="mt-0.5 max-w-xs text-xs text-slate-500">Ask a question or share an update. The requestor and approvers will be notified.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.authorId === meId;
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev?.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="h-px flex-1 bg-slate-200" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <div className={cn("flex items-end gap-2", mine && "flex-row-reverse", grouped && "-mt-1.5")}>
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", grouped && "invisible", mine ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-800")}>{initials(m.authorName)}</span>
                <div className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                  {!grouped && (
                    <p className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-slate-500", mine && "flex-row-reverse")}>
                      <span className="font-medium text-slate-700">{mine ? "You" : m.authorName}</span>
                      {m.role && <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-600">{m.role}</span>}
                      {m.kind === "CLARIFICATION_RESPONSE" && <span className="rounded bg-orange-50 px-1.5 py-px text-[10px] text-orange-700">Clarification response</span>}
                    </p>
                  )}
                  <div className={cn("rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words", mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-900")}>{m.body}</div>
                  <span className="mt-1 text-[10px] text-slate-500">{timeLabel(m.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canPost ? (
        <form
          className="border-t border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-surface p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              ref={input}
              rows={1}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder ?? "Write a message…"}
              maxLength={4000}
              aria-label="Message"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none"
            />
            <button type="submit" disabled={pending || !body.trim()} aria-label="Send message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-[#b91c1c] disabled:opacity-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-slate-500">
            <Mail className="h-3 w-3" />
            {emailEnabled ? "Participants are notified in the app and by email. " : "Participants are notified in the app. "}
            Enter to send · Shift+Enter for a new line
          </p>
        </form>
      ) : (
        <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">The discussion opens once the request is submitted.</p>
      )}
    </div>
  );
}
