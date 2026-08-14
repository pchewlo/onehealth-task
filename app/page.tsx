"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "./components/Chat";
import { MetricsTab } from "./components/MetricsTab";
import { PrincipalSwitcher } from "./components/PrincipalSwitcher";
import { AuditLog, TicketsPanel, type CorrectionNote } from "./components/RightRail";
import { TicketBoard } from "./components/TicketBoard";
import type {
  UiAuditEntry,
  UiComment,
  UiLearnedRule,
  UiMessage,
  UiNotification,
  UiPrincipal,
  UiTicket,
  UiToolCall,
} from "./lib/ui-types";
import { STATUS_LABEL } from "./lib/ui-types";

let nonce = 0;
const uid = () => `m_${Date.now()}_${nonce++}`;

// Conversations are demo memory, not governed data: they only ever contain
// what the layer already released to this browser, so localStorage is the
// honest place for them — the server stays stateless.
const CONVERSATIONS_KEY = "gal.conversations.v1";
const CONV_IDS_KEY = "gal.convIds.v1";
// Who you were signed in as (and which tab) survives a refresh.
const ACTIVE_KEY = "gal.activeId.v1";
const TAB_KEY = "gal.tab.v1";

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
  const [comments, setComments] = useState<UiComment[]>([]);
  const [correctionNote, setCorrectionNote] = useState<CorrectionNote | null>(null);
  const [focusTicketId, setFocusTicketId] = useState<string | null>(null);
  const idleAskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [devAskNote, setDevAskNote] = useState<string | null>(null);
  const askedConvs = useRef<Set<string>>(new Set());
  const seenNotifs = useRef<Set<string>>(new Set());

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
      const seen = localStorage.getItem("gal.seenNotifs.v1");
      if (seen) seenNotifs.current = new Set(JSON.parse(seen) as string[]);
      const savedActive = localStorage.getItem(ACTIVE_KEY);
      if (savedActive) setActiveId(savedActive);
      const savedTab = localStorage.getItem(TAB_KEY);
      if (savedTab === "chat" || savedTab === "tickets" || savedTab === "metrics") {
        setTab(savedTab);
      }
    } catch {
      // Corrupt or blocked storage — start fresh rather than crash the demo.
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(ACTIVE_KEY, activeId);
      localStorage.setItem(TAB_KEY, tab);
    } catch {}
  }, [activeId, tab]);

  const persistConvIds = () => {
    try {
      localStorage.setItem(CONV_IDS_KEY, JSON.stringify(convIds.current));
    } catch {}
  };

  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
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
    (tks: UiTicket[] | undefined, rules: UiLearnedRule[] | undefined, cms?: UiComment[]) => {
      if (tks) {
        setTickets((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          for (const t of tks) {
            const existing = byId.get(t.id);
            // Newest wins per ticket: a poll answered by a lagging serverless
            // instance must never roll back a move we already know about.
            const keepExisting =
              existing?.updatedAt && t.updatedAt && existing.updatedAt > t.updatedAt;
            if (!keepExisting) byId.set(t.id, t);
          }
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
      if (cms) {
        setComments((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]));
          for (const c of cms) byId.set(c.id, c);
          return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
        });
      }
    },
    [],
  );

  // Board updates for tickets this user raised, delivered into their chat.
  // Server already scopes by addressee; the client re-checks before injecting
  // so a mis-routed payload could still never land in the wrong thread.
  const ingestNotifications = useCallback((incoming: UiNotification[] | undefined) => {
    if (!incoming?.length) return;
    const fresh = incoming.filter(
      (n) => !seenNotifs.current.has(n.id),
    );
    if (!fresh.length) return;
    for (const n of fresh) seenNotifs.current.add(n.id);
    try {
      localStorage.setItem("gal.seenNotifs.v1", JSON.stringify([...seenNotifs.current]));
    } catch {}
    setConversations((c) => {
      const next = { ...c };
      for (const n of fresh) {
        const content = n.comment
          ? `${n.byName} commented on your ticket ${n.ticketId} ("${n.subject}"): “${n.comment}”`
          : n.toStatus
            ? `${n.byName} moved your ticket ${n.ticketId} ("${n.subject}") to ${STATUS_LABEL[n.toStatus] ?? n.toStatus}.`
            : `${n.byName} moved your ticket ${n.ticketId} ("${n.subject}") from ${n.fromTeam} to ${n.toTeam}.`;
        const msg: UiMessage = {
          id: `notice_${n.id}`,
          role: "assistant",
          content,
          ts: n.ts,
          notice: { ticketId: n.ticketId },
        };
        const thread = next[n.forPrincipalId] ?? [];
        if (!thread.some((m) => m.id === msg.id)) {
          next[n.forPrincipalId] = [...thread, msg];
        }
      }
      return next;
    });
  }, []);

  const refreshRails = useCallback(
    async (pid: string) => {
      const [a, t] = await Promise.all([
        fetch(`/api/audit?principalId=${pid}&limit=60`).then((r) => r.json()),
        fetch(`/api/tickets?principalId=${pid}`).then((r) => r.json()),
      ]);
      mergeAudit(a.audit);
      mergeTickets(t.tickets, t.learnedRules, t.comments);
      ingestNotifications(t.notifications);
    },
    [mergeAudit, mergeTickets, ingestNotifications],
  );

  useEffect(() => {
    refreshRails(activeId);
    const t = setInterval(() => refreshRails(activeId), 2000);
    return () => clearInterval(t);
  }, [activeId, refreshRails]);

  const active = principals.find((p) => p.id === activeId);
  const messages = conversations[activeId] ?? [];
  // Views mirror the scoping story: patients get the chat and nothing else,
  // dentists add their own tickets, and only internal staff see the metrics
  // dashboard — it's a business-wide view, not a per-practice one.
  const isPatient = active?.type === "patient";
  const isStaff = active?.type === "internal_staff";
  const tabs = isPatient
    ? (["chat"] as const)
    : isStaff
      ? (["chat", "tickets", "metrics"] as const)
      : (["chat", "tickets"] as const);

  // Sanitize restored state once principals arrive: an unknown saved id
  // falls back to the default, and a tab this user type doesn't have snaps
  // to chat (e.g. a restored "metrics" under a dentist).
  useEffect(() => {
    if (principals.length === 0) return;
    if (!principals.some((p) => p.id === activeId)) setActiveId("U_D1");
    else if (!(tabs as readonly string[]).includes(tab)) setTab("chat");
  }, [principals, activeId, tab, tabs]);

  const send = async (text: string) => {
    cancelIdleAsk();
    // Typing past an unanswered prompt marks it skipped — it stays in the
    // transcript as a record, and later prompts can still fire.
    const withoutAsk = messages.map((m) =>
      m.resolveAsk && !m.resolveAnswer ? { ...m, resolveAnswer: "skipped" as const } : m,
    );
    const userMsg: UiMessage = { id: uid(), role: "user", content: text, ts: new Date().toISOString() };
    const history = [...withoutAsk, userMsg];
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
        ts: new Date().toISOString(),
        toolCalls,
        tickets: newTickets.length ? newTickets : undefined,
      };
      setConversations((c) => ({ ...c, [activeId]: [...history, reply] }));
      // Same-instance snapshots piggybacked on the response (serverless-safe).
      mergeAudit(j.audit);
      mergeTickets(j.tickets, j.learnedRules, j.comments);
      ingestNotifications(j.notifications);
    } catch (e) {
      const err: UiMessage = {
        id: uid(),
        role: "assistant",
        content: e instanceof Error ? e.message : "Something went wrong.",
        ts: new Date().toISOString(),
        error: true,
      };
      setConversations((c) => ({ ...c, [activeId]: [...history, err] }));
    } finally {
      setBusy(false);
      refreshRails(activeId);
      scheduleIdleAsk(activeId);
    }
  };

  /* ── "Did this resolve your query?" ──
   * Fires once per conversation after 30s of silence following an assistant
   * reply, unless the user already gave explicit 👍/👎. An answer becomes a
   * GOLD-LABEL conversation_end (explicit: true) — user-stated, not inferred —
   * and the next message starts a fresh conversation. Silence falls through
   * to the usual inferred label on principal switch. */
  const IDLE_ASK_MS = 30_000;

  const cancelIdleAsk = () => {
    if (idleAskTimer.current) clearTimeout(idleAskTimer.current);
    idleAskTimer.current = null;
  };

  const injectResolveAsk = useCallback(
    (pid: string, opts?: { force?: boolean }): string | null => {
      const conv = convId(pid);
      const thread = conversationsRef.current[pid] ?? [];
      const last = [...thread].reverse().find((m) => m.role === "assistant" && !m.notice);
      if (!last || last.error) return "Nothing to close yet — send a message and get a reply first.";
      if (thread.some((m) => m.resolveAsk && !m.resolveAnswer)) return "The prompt is already showing.";
      if (askedConvs.current.has(conv)) return "Already asked for this conversation.";
      askedConvs.current.add(conv);
      setConversations((c) => ({
        ...c,
        [pid]: [
          ...(c[pid] ?? []),
          {
            id: `ask_${Date.now()}`,
            role: "assistant",
            content: "Did this resolve your query?",
            ts: new Date().toISOString(),
            resolveAsk: true,
          },
        ],
      }));
      return null;
    },
    [],
  );

  const scheduleIdleAsk = useCallback(
    (pid: string) => {
      cancelIdleAsk();
      idleAskTimer.current = setTimeout(() => injectResolveAsk(pid), IDLE_ASK_MS);
    },
    [injectResolveAsk],
  );

  const answerResolve = async (messageId: string, verdict: "yes" | "bad_answer" | "confusion") => {
    const conv = convId(activeId);
    setConversations((c) => ({
      ...c,
      [activeId]: (c[activeId] ?? []).map((m) =>
        m.id === messageId ? { ...m, resolveAnswer: verdict } : m,
      ),
    }));
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "conversation_end",
        principalId: activeId,
        conversationId: conv,
        resolved: verdict === "yes",
        reason: verdict === "yes" ? undefined : verdict,
        explicit: true,
      }),
    });
    // The conversation is closed; the next message starts a new one.
    delete convIds.current[activeId];
    persistConvIds();
  };

  const openTicket = (ticketId: string) => {
    setFocusTicketId(ticketId);
    setTab("tickets");
    setTimeout(() => setFocusTicketId((f) => (f === ticketId ? null : f)), 6000);
  };

  // A 404 on a ticket action means the server no longer has it (state was
  // reset or a cold start predates persistence) — the card is a ghost from
  // this tab's merge cache. Actions on it can never succeed, so drop it.
  const dropGhost = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    setComments((prev) => prev.filter((c) => c.ticketId !== ticketId));
  };

  const reassign = async (ticketId: string, team: string) => {
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalId: activeId, ticketId, team }),
    });
    const j = await r.json();
    if (r.status === 404) dropGhost(ticketId);
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
          : j.withdrewRuleId
            ? {
                ticketId,
                kind: "retired",
                detail: "↩️ Back to the original routing — the rule this ticket taught was withdrawn.",
              }
            : j.notLearnedBecause?.startsWith("back to the original")
              ? { ticketId, kind: "recorded", detail: "Back to the original routing — nothing to learn." }
              : {
                  ticketId,
                  kind: "recorded",
                  detail:
                    "Recorded as correction signal — hand-rule territory, so nothing auto-changes.",
                };
      setCorrectionNote(note);
      setTimeout(() => setCorrectionNote((n) => (n === note ? null : n)), 8000);
      // Snapshot from the instance that performed the write.
      mergeTickets(j.tickets, j.learnedRules, j.comments);
      ingestNotifications(j.notifications);
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

  const changeStatus = async (ticketId: string, status: string) => {
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalId: activeId, ticketId, status }),
    });
    const j = await r.json();
    if (r.status === 404) dropGhost(ticketId);
    if (r.ok) {
      mergeTickets(j.tickets, j.learnedRules, j.comments);
      ingestNotifications(j.notifications);
    }
    refreshRails(activeId);
  };

  const addTicketComment = async (ticketId: string, text: string) => {
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalId: activeId, ticketId, comment: text }),
    });
    const j = await r.json();
    if (r.status === 404) dropGhost(ticketId);
    if (r.ok) {
      mergeTickets(j.tickets, j.learnedRules, j.comments);
      ingestNotifications(j.notifications);
    }
    refreshRails(activeId);
  };

  const switchPrincipal = async (id: string) => {
    closeOutConversation(activeId);
    // The rails are scoped to the signed-in principal — clear before the new
    // scope's data arrives so one user's trail never lingers under another's.
    setAudit([]);
    setTickets([]);
    setLearnedRules([]);
    setComments([]);
    setCorrectionNote(null);
    setActiveId(id);
    // The tickets board is per-principal, so keep it open while clicking
    // through users; metrics (a global view) snaps back to chat, and a
    // patient only has chat at all.
    const target = principals.find((p) => p.id === id);
    if (tab === "metrics" || target?.type === "patient") setTab("chat");
  };

  const resetDemo = async () => {
    cancelIdleAsk();
    askedConvs.current.clear();
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
    setComments([]);
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
        onDevAskResolve={() => {
          cancelIdleAsk();
          const blocked = injectResolveAsk(activeId, { force: true });
          setDevAskNote(blocked);
          if (blocked) setTimeout(() => setDevAskNote(null), 4000);
        }}
        devAskNote={devAskNote}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            onResolve={answerResolve}
            onOpenTicket={openTicket}
          />
        ) : tab === "tickets" && active && !isPatient ? (
          <TicketBoard
            principal={active}
            principals={principals}
            tickets={tickets}
            comments={comments}
            note={correctionNote}
            focusTicketId={focusTicketId}
            onReassign={reassign}
            onStatusChange={changeStatus}
            onComment={addTicketComment}
          />
        ) : tab === "metrics" && isStaff ? (
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
