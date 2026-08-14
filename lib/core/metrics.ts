import type { MetricEvent, Team, UnresolvedReason } from "./types";

/**
 * Pure fold of the event stream into the dashboard numbers. No storage, no
 * side effects — given the same events it always produces the same answer,
 * which is what lets the simulator double as an eval harness: replay traffic,
 * diff the metrics.
 *
 * OMTM: Resolution Rate — % of conversations where the user's need was met
 * without human correction. Resolved iff the conversation contains at least
 * one assistant answer or created ticket AND no negative signal (👎, ticket
 * reassignment, rephrase-loop, denied-then-abandoned ending).
 */

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  resolved: number;
  total: number;
}

export interface Metrics {
  resolutionRate: number | null;
  conversations: number;
  resolvedConversations: number;
  daily: DailyPoint[];
  sessions: number;
  activePrincipals: number;
  answers: number;
  ticketsCreated: number;
  denials: number;
  denialRate: number | null;
  routingAgreementRate: number | null;
  reassignmentRate: number | null;
  thumbsUp: number;
  thumbsDown: number;
  unresolvedByReason: Record<UnresolvedReason, number>;
  ticketsByTeam: Partial<Record<Team, number>>;
}

export function foldMetrics(events: MetricEvent[]): Metrics {
  const conversations = new Map<
    string,
    { resolved: boolean; reason?: UnresolvedReason; date: string }
  >();

  let answers = 0;
  let ticketsCreated = 0;
  let denials = 0;
  let thumbsUp = 0;
  let thumbsDown = 0;
  let routedTotal = 0;
  let routedAgreed = 0;
  let reassigned = 0;
  const principals = new Set<string>();
  const ticketsByTeam: Partial<Record<Team, number>> = {};
  const unresolvedByReason: Record<UnresolvedReason, number> = {
    bad_answer: 0,
    mis_route: 0,
    confusion: 0,
    abandoned: 0,
  };

  for (const e of events) {
    principals.add(e.principalId);
    switch (e.type) {
      case "message":
        if (e.role === "assistant") answers += 1;
        break;
      case "ticket_created":
        ticketsCreated += 1;
        routedTotal += 1;
        if (e.routedBy === "model_confirmed") routedAgreed += 1;
        if (e.team) ticketsByTeam[e.team] = (ticketsByTeam[e.team] ?? 0) + 1;
        break;
      case "ticket_reassigned":
        reassigned += 1;
        break;
      case "denial":
        denials += 1;
        break;
      case "feedback":
        if (e.rating === "up") thumbsUp += 1;
        if (e.rating === "down") thumbsDown += 1;
        break;
      case "conversation_end": {
        const date = e.ts.slice(0, 10);
        conversations.set(e.conversationId, {
          resolved: Boolean(e.resolved),
          reason: e.reason,
          date,
        });
        if (!e.resolved && e.reason) unresolvedByReason[e.reason] += 1;
        break;
      }
    }
  }

  const convList = [...conversations.values()];
  const resolvedConversations = convList.filter((c) => c.resolved).length;

  // 14-day daily series, oldest first
  const byDay = new Map<string, { resolved: number; total: number }>();
  for (const c of convList) {
    const d = byDay.get(c.date) ?? { resolved: 0, total: 0 };
    d.total += 1;
    if (c.resolved) d.resolved += 1;
    byDay.set(c.date, d);
  }
  const daily: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, v]) => ({ date, ...v }));

  const interactions = answers + denials;

  return {
    resolutionRate: convList.length ? resolvedConversations / convList.length : null,
    conversations: convList.length,
    resolvedConversations,
    daily,
    sessions: convList.length,
    activePrincipals: principals.size,
    answers,
    ticketsCreated,
    denials,
    denialRate: interactions ? denials / interactions : null,
    routingAgreementRate: routedTotal ? routedAgreed / routedTotal : null,
    reassignmentRate: ticketsCreated ? reassigned / ticketsCreated : null,
    thumbsUp,
    thumbsDown,
    unresolvedByReason,
    ticketsByTeam,
  };
}

/**
 * Synthetic backfill — two weeks of plausible history so the dashboard is not
 * an empty page on first boot. Deterministic (seeded PRNG), and every event is
 * tagged synthetic:true so the UI can label it honestly. Resolution drifts
 * 62% → 78% across the window: the story the real system should tell as the
 * router and prompts absorb correction signal.
 */
export function buildBackfill(now: Date): MetricEvent[] {
  const events: MetricEvent[] = [];
  let seedState = 42;
  const rand = () => {
    // xorshift — deterministic across boots
    seedState ^= seedState << 13;
    seedState ^= seedState >>> 17;
    seedState ^= seedState << 5;
    return ((seedState >>> 0) % 1000) / 1000;
  };

  const principals = ["U_D1", "U_D2", "U_D3", "U_AM1", "U_P1"];
  const teams: Team[] = ["ops", "clinical", "support", "finance", "sales"];
  const reasons: UnresolvedReason[] = ["bad_answer", "mis_route", "confusion", "abandoned"];
  let n = 0;

  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const day = new Date(now.getTime() - daysAgo * 86_400_000);
    const dayIso = day.toISOString();
    const targetRate = 0.62 + (0.16 * (14 - daysAgo)) / 13; // 62% → 78%
    const convCount = 6 + Math.floor(rand() * 5);

    for (let c = 0; c < convCount; c++) {
      n += 1;
      const convId = `bf_${daysAgo}_${c}`;
      const principalId = principals[Math.floor(rand() * principals.length)];
      const resolved = rand() < targetRate;
      const ts = new Date(day.getTime() + c * 3_600_000).toISOString();

      events.push({
        id: `bfev_${n}_u`, ts, type: "message", principalId, conversationId: convId,
        role: "user", synthetic: true,
      });
      events.push({
        id: `bfev_${n}_a`, ts, type: "message", principalId, conversationId: convId,
        role: "assistant", synthetic: true,
      });

      if (rand() < 0.4) {
        const agreed = rand() < 0.55 + (0.2 * (14 - daysAgo)) / 13; // agreement improves too
        events.push({
          id: `bfev_${n}_t`, ts, type: "ticket_created", principalId, conversationId: convId,
          team: teams[Math.floor(rand() * teams.length)],
          routedBy: agreed ? "model_confirmed" : "rules",
          synthetic: true,
        });
        if (!resolved && rand() < 0.5) {
          events.push({
            id: `bfev_${n}_r`, ts, type: "ticket_reassigned", principalId, conversationId: convId,
            synthetic: true,
          });
        }
      }
      if (rand() < 0.12) {
        events.push({
          id: `bfev_${n}_d`, ts, type: "denial", principalId, conversationId: convId,
          synthetic: true,
        });
      }
      if (rand() < 0.5) {
        events.push({
          id: `bfev_${n}_f`, ts, type: "feedback", principalId, conversationId: convId,
          rating: resolved ? "up" : rand() < 0.7 ? "down" : "up",
          synthetic: true,
        });
      }
      events.push({
        id: `bfev_${n}_e`, ts: dayIso, type: "conversation_end", principalId,
        conversationId: convId, resolved,
        reason: resolved ? undefined : reasons[Math.floor(rand() * reasons.length)],
        synthetic: true,
      });
    }
  }
  return events;
}
