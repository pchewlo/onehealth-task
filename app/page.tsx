"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "./components/Chat";
import { MetricsTab } from "./components/MetricsTab";
import { PrincipalSwitcher } from "./components/PrincipalSwitcher";
import { AuditLog, TicketsPanel, type CorrectionNote } from "./components/RightRail";
import { TicketBoard } from "./components/TicketBoard";
import type {
  UiAuditEntry,
  UiLearnedRule,
  UiMessage,
  UiPrincipal,
  UiTicket,
  UiToolCall,
} from "./lib/ui-types";

let nonce = 0;
const uid = () => `m_${Date.now()}_${nonce++}`;

// Conversations are demo memory, not governed data: they only ever contain
// what the layer already released to this browser, so localStorage is the
// honest place for them — the server stays stateless.
const CONVERSATIONS_KEY = "gal.conversations.v1";
const CONV_IDS_KEY = "gal.convIds.v1";

export default function Home() {
  const [principals, setPrincipals] = useState<UiPrincipal[]>([]);
  const [activeId, setActiveId] = useState<string>("U_D1");
  const [tab, setTab] = useState<"chat" | "tickets" | "metrics">("chat");
  const [conversations, setConversations] = useState<Record<string, UiMessage[]>>({});
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [audit, setAudit] = useState<UiAuditEntry[]>([]);
  const [tickets, setTickets] = useState<UiTicket[]>([]);
  const [learnedRules, setLearnedRules] = useState<UiLearnedRule[]>([]);
  const [correctionNote, setCorrectionNote] = useState<CorrectionNote | null>(null);

  // One conversation id per principal per page load — feeds the metric events.
  const convIds = useRef<Record<string, string>>({});
  const convId = (pid: string) => {
    if (!convIds.current[pid]) convIds.current[pid] = `conv_${pid}_${Date.now()}`;
    return convIds.current[pid];
  };

  useEffect(() => {
    fetch("/api/principals")
      .then((r) => r.json())
      .then((j) => setPrincipals(j.principals ?? []));
  }, []);

  // Restore past conversations after mount (not in the initializer — the
  // server prerender has no localStorage, and diverging would break hydration).
  const restored = useRef(false);
  useEffect(() => {
    try {
      const c = localStorage.getItem(CONVERSATIONS_KEY);
      if (c) setConversations(JSON.parse(c) as Record<string, UiMessage[]>);
      const ids = localStorage.getItem(CONV_IDS_KEY);
      if (ids) convIds.current = JSON.parse(ids) as Record<string, string>;
    } catch {
      // Corrupt or blocked storage — start fresh rather than crash the demo.
    }
    restored.current = true;
  }, []);

  const persistConvIds = () => {
    try {
      localStorage.setItem(CONV_IDS_KEY, JSON.stringify(convIds.current));
    } catch {}
  };

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
      localStorage.setItem(CONV_IDS_KEY, JSON.stringify(convIds.current));
    } catch {}
  }, [conversations]);

  // Serverless-safe rails: GET polls may be answered by an instance that never
  // saw this session's writes, so responses that DID the writes (chat,
  // reassign) carry their own snapshots and we merge — never overwrite with
  // less than we already know.
  const mergeAudit = useCallback((incoming: UiAuditEntry[] | undefined) => {
    if (!incoming?.length) return;
    setAudit((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      for (const e of incoming) byId.set(e.id, e);
      return [...byId.values()]
        .sort((a, b) => (a.ts === b.ts ? b.id.localeCompare(a.id) : b.ts.localeCompare(a.ts)))
        .slice(0, 60);
    });
  }, []);

  const mergeTickets = useCallback(
    (tks: UiTicket[] | undefined, rules: UiLearnedRule[] | undefined) => {
      if (tks) {
        setTickets((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          for (const t of tks) byId.set(t.id, t);
          return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
      }
      if (rules) {
        setLearnedRules((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          for (const r of rules) byId.set(r.id, r);
          return [...byId.values()];
        });
      }
    },
    [],
  );

  const refreshRails = useCallback(
    async (pid: string) => {
      const [a, t] = await Promise.all([
        fetch(`/api/audit?principalId=${pid}&limit=60`).then((r) => r.json()),
        fetch(`/api/tickets?principalId=${pid}`).then((r) => r.json()),
      ]);
      mergeAudit(a.audit);
      mergeTickets(t.tickets, t.learnedRules);
    },
    [mergeAudit, mergeTickets],
  );

  useEffect(() => {
    refreshRails(activeId);
    const t = setInterval(() => refreshRails(activeId), 2000);
    return () => clearInterval(t);
  }, [activeId, refreshRails]);

  const active = principals.find((p) => p.id === activeId);
  const messages = conversations[activeId] ?? [];
  // Patients get the chat and nothing else — tickets, audit and metrics are
  // back-office surfaces. Same spirit as the API scoping: the view shows only
  // what this user is meant to see.
  const isPatient = active?.type === "patient";
  const tabs = isPatient ? (["chat"] as const) : (["chat", "tickets", "metrics"] as const);

  const send = async (text: string) => {
    const userMsg: UiMessage = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setConversations((c) => ({ ...c, [activeId]: history }));
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principalId: activeId,
          conversationId: convId(activeId),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 503 || /credit|api key/i.test(j.error ?? "")) setKeyMissing(true);
        throw new Error(j.error ?? "Request failed");
      }
      const toolCalls: UiToolCall[] = j.toolCalls ?? [];
      const newTickets = toolCalls
        .filter((c) => c.tool === "create_ticket" && c.allowed)
        .map((c) => (c.result as { ticket?: UiTicket })?.ticket)
        .filter((t): t is UiTicket => Boolean(t));
      const reply: UiMessage = {
        id: uid(),
        role: "assistant",
        content: j.reply || "(no reply)",
        toolCalls,
        tickets: newTickets.length ? newTickets : undefined,
      };
      setConversations((c) => ({ ...c, [activeId]: [...history, reply] }));
      // Same-instance snapshots piggybacked on the response (serverless-safe).
      mergeAudit(j.audit);
      mergeTickets(j.tickets, j.learnedRules);
    } catch (e) {
      const err: UiMessage = {
        id: uid(),
        role: "assistant",
        content: e instanceof Error ? e.message : "Something went wrong.",
        error: true,
      };
      setConversations((c) => ({ ...c, [activeId]: [...history, err] }));
    } finally {
      setBusy(false);
      refreshRails(activeId);
    }
  };

  const feedback = async (messageId: string, rating: "up" | "down") => {
    setConversations((c) => ({
      ...c,
      [activeId]: (c[activeId] ?? []).map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)),
    }));
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feedback",
        principalId: activeId,
        conversationId: convId(activeId),
        rating,
      }),
    });
  };

  const reassign = async (ticketId: string, team: string) => {
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalId: activeId, ticketId, team }),
    });
    const j = await r.json();
    if (r.ok) {
      const note: CorrectionNote = j.learned
        ? {
            ticketId,
            kind: "learned",
            detail: `📚 Router learned: ${
              j.learned.tokens?.length ? j.learned.tokens.join("+") : "this exact subject"
            } → ${team}`,
          }
        : j.retiredRuleId
          ? { ticketId, kind: "retired", detail: "Mis-firing learned rule retired." }
          : {
              ticketId,
              kind: "recorded",
              detail:
                "Recorded as correction signal — hand-rule territory, so nothing auto-changes.",
            };
      setCorrectionNote(note);
      setTimeout(() => setCorrectionNote((n) => (n === note ? null : n)), 8000);
      // Snapshot from the instance that performed the write.
      mergeTickets(j.tickets, j.learnedRules);
    }
    refreshRails(activeId);
  };

  // Close out a principal's conversation for the metrics stream, if it had turns.
  const closeOutConversation = (pid: string) => {
    const old = conversations[pid] ?? [];
    if (old.length === 0) return;
    const lastAssistant = [...old].reverse().find((m) => m.role === "assistant");
    const thumbedDown = old.some((m) => m.feedback === "down");
    const endedOnDenial = Boolean(
      lastAssistant?.toolCalls?.length && lastAssistant.toolCalls.every((c) => !c.allowed),
    );
    const resolved = Boolean(lastAssistant && !lastAssistant.error && !thumbedDown && !endedOnDenial);
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "conversation_end",
        principalId: pid,
        conversationId: convId(pid),
        resolved,
        reason: resolved ? undefined : thumbedDown ? "bad_answer" : endedOnDenial ? "abandoned" : "confusion",
      }),
    });
    delete convIds.current[pid];
    persistConvIds();
  };

  // "Clear chat" for the signed-in user only: ends the conversation for the
  // metrics stream, then forgets the messages (state + localStorage).
  const clearChat = () => {
    closeOutConversation(activeId);
    setConversations((c) => {
      const next = { ...c };
      delete next[activeId];
      return next;
    });
  };

  const switchPrincipal = async (id: string) => {
    closeOutConversation(activeId);
    // The rails are scoped to the signed-in principal — clear before the new
    // scope's data arrives so one user's trail never lingers under another's.
    setAudit([]);
    setTickets([]);
    setLearnedRules([]);
    setCorrectionNote(null);
    setActiveId(id);
    // The tickets board is per-principal, so keep it open while clicking
    // through users; metrics (a global view) snaps back to chat, and a
    // patient only has chat at all.
    const target = principals.find((p) => p.id === id);
    if (tab === "metrics" || target?.type === "patient") setTab("chat");
  };

  const resetDemo = async () => {
    setResetting(true);
    await fetch("/api/reset", { method: "POST" });
    setConversations({});
    convIds.current = {};
    try {
      localStorage.removeItem(CONVERSATIONS_KEY);
      localStorage.removeItem(CONV_IDS_KEY);
    } catch {}
    setAudit([]);
    setTickets([]);
    setLearnedRules([]);
    setCorrectionNote(null);
    setResetting(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <PrincipalSwitcher
        principals={principals}
        activeId={activeId}
        onSwitch={switchPrincipal}
        onReset={resetDemo}
        resetting={resetting}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-5 border-b border-[var(--line)] bg-white/70 px-6 py-3">
          <div>
            <h1 className="text-[14px] font-semibold leading-tight">Governed Agent Layer</h1>
            <p className="text-[11px] text-[var(--muted)]">
              The model proposes · the server decides
            </p>
          </div>
          {tab === "chat" && messages.length > 0 && (
            <button
              onClick={clearChat}
              title="Forget this user's conversation — it's closed out for metrics first. Reset demo clears every user's history."
              className="ml-auto text-[11px] font-medium text-stone-400 transition hover:text-[var(--deny)]"
            >
              clear chat
            </button>
          )}
          <nav
            className={`flex gap-1 rounded-lg border border-[var(--line)] bg-white p-0.5 ${tab === "chat" && messages.length > 0 ? "" : "ml-auto"} ${tabs.length === 1 ? "invisible" : ""}`}
          >
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3.5 py-1 text-[12px] font-medium capitalize transition ${
                  tab === t ? "bg-[var(--accent)] text-white" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </header>

        {tab === "chat" && active ? (
          <Chat
            principal={active}
            messages={messages}
            busy={busy}
            keyMissing={keyMissing}
            onSend={send}
            onFeedback={feedback}
          />
        ) : tab === "tickets" && active && !isPatient ? (
          <TicketBoard
            principal={active}
            tickets={tickets}
            note={correctionNote}
            onReassign={reassign}
          />
        ) : tab === "metrics" && !isPatient ? (
          <MetricsTab keyMissing={keyMissing} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--muted)]">
            Loading…
          </div>
        )}
      </main>

      {tab === "chat" && !isPatient && (
        <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--line)] bg-white/60">
          <AuditLog
            entries={audit}
            nameOf={(id) => principals.find((p) => p.id === id)?.name ?? id}
          />
          <TicketsPanel
            tickets={tickets}
            learnedRules={learnedRules}
            note={correctionNote}
            onReassign={reassign}
          />
        </aside>
      )}
    </div>
  );
}
