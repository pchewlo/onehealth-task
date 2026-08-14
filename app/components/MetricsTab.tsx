"use client";

import { useCallback, useEffect, useState } from "react";
import { TEAM_COLORS } from "../lib/ui-types";

interface DailyPoint {
  date: string;
  resolved: number;
  total: number;
}

interface Metrics {
  resolutionRate: number | null;
  conversations: number;
  resolvedConversations: number;
  daily: DailyPoint[];
  activePrincipals: number;
  answers: number;
  ticketsCreated: number;
  denials: number;
  denialRate: number | null;
  routingAgreementRate: number | null;
  reassignmentRate: number | null;
  thumbsUp: number;
  thumbsDown: number;
  unresolvedByReason: Record<string, number>;
  ticketsByTeam: Record<string, number>;
}

interface SimResult {
  id: string;
  principalId: string;
  message: string;
  expect: string;
  actual: string;
  pass: boolean;
  reply: string;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function Sparkline({ daily }: { daily: DailyPoint[] }) {
  if (!daily.length) return null;
  return (
    <div className="flex h-12 items-end gap-[3px]">
      {daily.map((d) => {
        const rate = d.total ? d.resolved / d.total : 0;
        return (
          <div
            key={d.date}
            title={`${d.date}: ${Math.round(rate * 100)}% (${d.resolved}/${d.total})`}
            className="w-3 rounded-t-sm bg-[var(--accent)] opacity-80 transition hover:opacity-100"
            style={{ height: `${Math.max(8, rate * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function MetricsTab({ keyMissing }: { keyMissing: boolean }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [counts, setCounts] = useState<{ live: number; synthetic: number }>({ live: 0, synthetic: 0 });
  const [simRunning, setSimRunning] = useState(false);
  const [simResults, setSimResults] = useState<SimResult[] | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [ambient, setAmbient] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/metrics");
    if (!r.ok) return;
    const j = await r.json();
    setMetrics(j.metrics);
    setCounts({ live: j.liveEvents, synthetic: j.syntheticEvents });
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const runSim = async () => {
    setSimRunning(true);
    setSimError(null);
    try {
      const r = await fetch("/api/simulate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Simulation failed");
      setSimResults(j.results);
      refresh();
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimRunning(false);
    }
  };

  if (!metrics) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--muted)]">
        Loading metrics…
      </div>
    );
  }

  const misroutes = simResults?.filter((r) => !r.pass && r.actual.startsWith("ticket")).length ?? 0;
  const denied = simResults?.filter((r) => r.actual === "denied").length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-[840px] space-y-5">
        <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11.5px] text-[var(--muted)]">
          Backfilled synthetic data for demo ({counts.synthetic} events); live events append from
          your session ({counts.live} so far).
        </div>

        {/* OMTM */}
        <div className="flex items-end justify-between rounded-2xl border border-[var(--line)] bg-white px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Resolution rate · the one metric that matters
            </div>
            <div className="mt-1 text-[44px] font-semibold leading-none tabular-nums text-[var(--accent)]">
              {pct(metrics.resolutionRate)}
            </div>
            <div className="mt-1.5 text-[12px] text-[var(--muted)]">
              {metrics.resolvedConversations} of {metrics.conversations} conversations resolved
              without human correction
            </div>
          </div>
          <div className="text-right">
            <Sparkline daily={metrics.daily} />
            <div className="mt-1 text-[10.5px] text-[var(--muted)]">last 14 days</div>
          </div>
        </div>

        {/* Funnel stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Answers" value={String(metrics.answers)} />
          <StatCard
            label="Tickets"
            value={String(metrics.ticketsCreated)}
            sub={Object.entries(metrics.ticketsByTeam)
              .map(([t, n]) => `${t} ${n}`)
              .join(" · ")}
          />
          <StatCard
            label="Denials"
            value={String(metrics.denials)}
            sub={`${pct(metrics.denialRate)} of interactions`}
          />
          <StatCard
            label="Feedback"
            value={`${metrics.thumbsUp}👍 ${metrics.thumbsDown}👎`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Routing agreement (model vs rules)"
            value={pct(metrics.routingAgreementRate)}
            sub="how often the model's proposed team matched the rules — watch this before trusting the model to route"
          />
          <StatCard
            label="Ticket reassignment rate"
            value={pct(metrics.reassignmentRate)}
            sub="human corrections — each one is a labelled training example for the router"
          />
        </div>

        {/* Unresolved reasons */}
        <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Unresolved by reason
          </div>
          <div className="mt-2 space-y-1.5">
            {Object.entries(metrics.unresolvedByReason).map(([reason, n]) => {
              const max = Math.max(1, ...Object.values(metrics.unresolvedByReason));
              return (
                <div key={reason} className="flex items-center gap-2 text-[12px]">
                  <span className="w-24 text-[var(--muted)]">{reason.replace("_", " ")}</span>
                  <div className="h-3 flex-1 rounded bg-stone-100">
                    <div
                      className="h-3 rounded bg-stone-400"
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simulator */}
        <div className="rounded-2xl border border-[var(--line)] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={runSim}
              disabled={simRunning || keyMissing}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {simRunning ? "Simulating…" : "▶ Simulate a morning"}
            </button>
            <div className="text-[12px] text-[var(--muted)]">
              {simRunning
                ? "Running 15 fixtures through the real chat pipeline…"
                : simResults
                  ? `${simResults.filter((r) => r.pass).length}/${simResults.length} as expected · ${misroutes} mis-routed · ${denied} denied`
                  : "15 fixtures through the real pipeline — doubles as the eval harness."}
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <input
                type="checkbox"
                checked={ambient}
                onChange={(e) => setAmbient(e.target.checked)}
                disabled
                title="Ambient timer (inject one fixture every N minutes) — off for the demo"
              />
              ambient timer
            </label>
          </div>
          {keyMissing && (
            <p className="mt-2 text-[11.5px] text-[var(--warn)]">
              Needs API credit on the server key.
            </p>
          )}
          {simError && <p className="mt-2 text-[11.5px] text-[var(--deny)]">{simError}</p>}

          {simResults && (
            <table className="mt-3 w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">as</th>
                  <th className="py-1.5 pr-2">message</th>
                  <th className="py-1.5 pr-2">expected</th>
                  <th className="py-1.5 pr-2">actual</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {simResults.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100 align-top">
                    <td className="py-1.5 pr-2 font-mono text-[var(--muted)]">{r.id}</td>
                    <td className="py-1.5 pr-2 font-mono">{r.principalId}</td>
                    <td className="py-1.5 pr-2 text-stone-600" title={r.reply}>
                      {r.message.length > 56 ? `${r.message.slice(0, 56)}…` : r.message}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Expect v={r.expect} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Expect v={r.actual} />
                    </td>
                    <td className="py-1.5">{r.pass ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-2.5 text-[11.5px] text-stone-400">
          Requires production data: cases per practice · ops hours saved · time-to-resolution by
          team
        </div>
      </div>
    </div>
  );
}

function Expect({ v }: { v: string }) {
  if (v.startsWith("ticket:")) {
    const team = v.slice(7);
    return (
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TEAM_COLORS[team] ?? "bg-stone-200"}`}>
        ticket→{team}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        v === "denied" ? "bg-red-100 text-red-700" : v === "resolved" ? "bg-green-100 text-green-700" : "bg-stone-200"
      }`}
    >
      {v}
    </span>
  );
}
