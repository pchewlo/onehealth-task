"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "./components/Chat";
import { MetricsTab } from "./components/MetricsTab";
import { PrincipalSwitcher } from "./components/PrincipalSwitcher";
import { AuditLog, TicketsPanel } from "./components/RightRail";
import type {
  UiAuditEntry,
  UiMessage,
  UiPrincipal,
  UiTicket,
  UiToolCall,
} from "./lib/ui-types";

let nonce = 0;
const uid = () => `m_${Date.now()}_${nonce++}`;

export default function Home() {
  const [principals, setPrincipals] = useState<UiPrincipal[]>([]);
  const [activeId, setActiveId] = useState<string>("U_D1");
  const [tab, setTab] = useState<"chat" | "metrics">("chat");
  const [conversations, setConversations] = useState<Record<string, UiMessage[]>>({});
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [audit, setAudit] = useState<UiAuditEntry[]>([]);
  const [tickets, setTickets] = useState<UiTicket[]>([]);

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

  const refreshRails = useCallback(async (pid: string) => {
    const [a, t] = await Promise.all([
      fetch("/api/audit?limit=60").then((r) => r.json()),
      fetch(`/api/tickets?principalId=${pid}`).then((r) => r.json()),
    ]);
    setAudit(a.audit ?? []);
    setTickets(t.tickets ?? []);
  }, []);

  useEffect(() => {
    refreshRails(activeId);
    const t = setInterval(() => refreshRails(activeId), 2000);
    return () => clearInterval(t);
  }, [activeId, refreshRails]);

  const active = principals.find((p) => p.id === activeId);
  const messages = conversations[activeId] ?? [];

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

  const switchPrincipal = async (id: string) => {
    // Close out the old conversation for the metrics stream, if it had turns.
    const old = conversations[activeId] ?? [];
    if (old.length > 0) {
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
          principalId: activeId,
          conversationId: convId(activeId),
          resolved,
          reason: resolved ? undefined : thumbedDown ? "bad_answer" : endedOnDenial ? "abandoned" : "confusion",
        }),
      });
      delete convIds.current[activeId];
    }
    setActiveId(id);
    setTab("chat");
  };

  const resetDemo = async () => {
    setResetting(true);
    await fetch("/api/reset", { method: "POST" });
    setConversations({});
    convIds.current = {};
    setAudit([]);
    setTickets([]);
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
          <nav className="ml-auto flex gap-1 rounded-lg border border-[var(--line)] bg-white p-0.5">
            {(["chat", "metrics"] as const).map((t) => (
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
        ) : tab === "metrics" ? (
          <MetricsTab keyMissing={keyMissing} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--muted)]">
            Loading…
          </div>
        )}
      </main>

      {tab === "chat" && (
        <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--line)] bg-white/60">
          <AuditLog entries={audit} />
          <TicketsPanel
            tickets={tickets}
            onReassign={async (ticketId, team) => {
              await fetch("/api/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ principalId: activeId, ticketId, team }),
              });
              refreshRails(activeId);
            }}
          />
        </aside>
      )}
    </div>
  );
}
