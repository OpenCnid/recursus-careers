"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, ChevronRight, CircleHelp, Radar, Sparkles } from "lucide-react";
import type { Application, InboxJob } from "@/lib/career-ops";
import type { DiscoveredOffer } from "@/lib/explore";
import { canonStatus, scoreNum } from "@/lib/format";
import { DiscoveryCard } from "@/components/explore/discovery-card";
import { FollowUpCard, type FollowUp } from "@/components/home/follow-up-card";
import { DecisionCard } from "@/components/home/decision-card";
import { QuickEvaluate } from "@/components/quick-evaluate";

// The retention "Today": a dual-loop action queue (the maintainer's
// "N new matches this week · M follow-ups due"). SUPPLY loop = fresh free-scan
// matches (zero tokens, /api/whats-new); DEMAND loop = follow-ups due
// (/api/followups). Each item one-tap actionable. Home stays a VIEW over the
// canonical files — every action dispatches a real registry action / route.
export function TodayDashboard({
  applications,
  inbox,
  inBetween,
}: {
  applications: Application[];
  inbox: InboxJob[];
  inBetween: boolean;
}) {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [fresh, setFresh] = useState<DiscoveredOffer[]>([]);
  const [freshCount, setFreshCount] = useState(0);
  const router = useRouter();
  const dateLabel = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }), []);

  const refetch = useCallback(() => {
    fetch("/api/followups")
      .then((r) => r.json())
      .then((d) => {
        setFollowups(Array.isArray(d.entries) ? d.entries : []);
        setOverdue(d.metadata?.overdue ?? d.entries?.length ?? 0);
      })
      .catch(() => {});
    fetch("/api/whats-new")
      .then((r) => r.json())
      .then((d) => {
        const offers = Array.isArray(d.offers) ? d.offers : [];
        const count = Number(d.count);
        setFresh(offers);
        setFreshCount(Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : offers.length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refetch();
    // A worker (evaluate/pdf) just wrote a real tracker row — refresh the server
    // snapshot (applications/inbox props) + the client loops so the freshly-scored
    // role appears in "Awaiting your decision" without a manual reload.
    const onDone = () => {
      router.refresh();
      refetch();
    };
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [refetch, router]);

  // Awaiting decision: scored (Evaluated) but no terminal status yet.
  const awaiting = useMemo(
    () => applications.filter((a) => /^evaluat/i.test(a.status)).slice(0, 6),
    [applications],
  );

  const newThisWeek = freshCount;
  const allClear = newThisWeek === 0 && overdue === 0 && awaiting.length === 0;
  const inboxUrls = useMemo(() => new Set(inbox.map((j) => j.url)), [inbox]);
  const active = useMemo(
    () => applications.filter((app) => !/(REJECTED|DISCARDED|HIRED)/.test(canonStatus(app.status))),
    [applications],
  );
  const pipelineRows = useMemo(
    () => [...active].sort((a, b) => scoreNum(b.score) - scoreNum(a.score)).slice(0, 5),
    [active],
  );
  const interviews = applications.filter((app) => canonStatus(app.status).includes("INTERVIEW")).length;
  const needsAttention = overdue + awaiting.length;
  const nextAction = overdue > 0 && followups[0]
    ? {
        eyebrow: "Follow-up due",
        title: `${followups[0].company}${followups[0].role ? ` · ${followups[0].role}` : ""}`,
        body: "Keep the conversation alive and record the touchpoint so the next reminder stays accurate.",
        href: "/followups",
        label: "Open planner",
      }
    : awaiting[0]
      ? {
          eyebrow: "Recommended next",
          title: `Review ${awaiting[0].company}`,
          body: "The evaluation is ready. Review the report, tailored materials, and next step before acting.",
          href: `/pipeline/${awaiting[0].n}`,
          label: "Continue workflow",
        }
      : {
          eyebrow: allClear ? "Pipeline ready" : "New matches",
          title: allClear ? "Run your next portal scan" : `Review ${newThisWeek} new match${newThisWeek === 1 ? "" : "es"}`,
          body: allClear
            ? "Your tracker is clear. Scan supported portals when you want to bring new roles into review."
            : "Choose which discoveries deserve evaluation; nothing enters your tracked pipeline automatically.",
          href: "/explore",
          label: "Open discover",
        };

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8 max-sm:pb-24">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">{dateLabel}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-landing">Your job search</h1>
          <p className="mt-1 text-sm text-muted">See the whole pipeline, then take the next useful step.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pipeline" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-hover">
            View all jobs
          </Link>
          {inBetween && <QuickEvaluate />}
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Active jobs" value={active.length} detail={`Across ${new Set(active.map((app) => app.company)).size} companies`} />
        <Metric label="Need attention" value={needsAttention} detail={`${awaiting.length} decisions · ${overdue} follow-ups`} accent={needsAttention > 0} />
        <Metric label="Interviews" value={interviews} detail={interviews > 0 ? "Keep preparation current" : "No interviews scheduled"} />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface/65" aria-labelledby="pipeline-title">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div>
              <h2 id="pipeline-title" className="text-base font-semibold text-foreground">Pipeline</h2>
              <p className="mt-0.5 text-xs text-muted">Prioritized by score and the next action you control</p>
            </div>
            <Link href="/pipeline" className="text-xs font-medium text-brand-text transition hover:text-brand">All {applications.length}</Link>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_4rem_7rem_1.5rem] gap-3 border-b border-border bg-background/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint sm:grid">
            <span>Role</span><span className="text-center">Score</span><span>Next step</span><span />
          </div>
          {pipelineRows.length > 0 ? (
            <div className="divide-y divide-border">
              {pipelineRows.map((app) => {
                const status = stageLabel(app.status);
                return (
                  <Link key={app.n} href={`/pipeline/${app.n}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_4rem_7rem_1.5rem]">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-medium text-foreground">{app.company} · {app.role}</strong>
                      <span className="mt-0.5 block truncate text-xs text-muted">{app.date || "Tracked"} · {app.status || "Evaluation ready"}</span>
                    </span>
                    <span className="hidden text-center text-sm font-semibold tabular-nums sm:block">{app.score || "—"}</span>
                    <span className={status.tone}>{status.label}</span>
                    <ChevronRight className="hidden size-4 text-faint sm:block" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 px-4 py-8">
              <div><p className="text-sm font-medium">No tracked jobs yet</p><p className="mt-1 text-xs text-muted">Discover a role or paste a job URL to start the workflow.</p></div>
              <Link href="/explore" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-text hover:bg-brand/15">Discover <ArrowRight className="size-3.5" /></Link>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-surface/65 p-4" aria-labelledby="next-action-title">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-secondary">{nextAction.eyebrow}</p>
          <h2 id="next-action-title" className="mt-2 text-lg font-semibold leading-snug text-foreground">{nextAction.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{nextAction.body}</p>
          <div className="my-4 border-t border-border" />
          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-4"><span className="text-muted">Active</span><strong>{active.length}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Pending decisions</span><strong>{awaiting.length}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Follow-ups</span><strong>{overdue}</strong></div>
          </div>
          <Link href={nextAction.href} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-200">
            {nextAction.label} <ArrowRight className="size-4" />
          </Link>
        </aside>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-surface/50 px-4 py-3.5" aria-labelledby="scan-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand"><Radar className="size-4" /></span>
            <div><h2 id="scan-title" className="text-sm font-semibold">Latest portal scan</h2><p className="mt-0.5 text-xs text-muted">{newThisWeek} new roles · {fresh.length} ready to review</p></div>
          </div>
          <Link href="/explore" className="text-xs font-medium text-brand-text transition hover:text-brand">Review results</Link>
        </div>
      </section>

      {followups.length > 0 && (
        <Section icon={Bell} title="Follow-ups due" hint="Keep your applications alive — a nudge beats silence">
          <div className="grid gap-2.5">
            {followups.map((f) => (
              <FollowUpCard key={`${f.num}-${f.company}`} followup={f} onLogged={() => setOverdue((n) => Math.max(0, n - 1))} />
            ))}
          </div>
        </Section>
      )}

      {awaiting.length > 0 && (
        <Section icon={CircleHelp} title="Awaiting your decision" hint="Scored — review, apply, or skip">
          <div className="grid gap-2.5 lg:grid-cols-2">
            {awaiting.map((a) => (
              <DecisionCard key={a.n} app={a} />
            ))}
          </div>
        </Section>
      )}

      {fresh.length > 0 && (
        <Section icon={Sparkles} title="Fresh matches" hint="Found by your portal scans · nothing is added automatically">
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {fresh.slice(0, 6).map((offer) => (
              <DiscoveryCard key={offer.url} offer={offer} inPipeline={inboxUrls.has(offer.url)} />
            ))}
          </div>
          {fresh.length > 6 && (
            <Link href="/explore?view=fresh" className="mt-3 inline-flex items-center text-sm text-muted transition hover:text-brand">
              See all {freshCount} →
            </Link>
          )}
        </Section>
      )}
    </div>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: number; detail: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface/65 px-4 py-3.5">
      <p className="text-xs text-muted">{label}</p>
      <strong className={accent ? "mt-1 block text-2xl font-semibold tabular-nums text-brand-secondary" : "mt-1 block text-2xl font-semibold tabular-nums text-foreground"}>{value}</strong>
      <p className="mt-0.5 text-[11px] text-faint">{detail}</p>
    </div>
  );
}

function stageLabel(status: string): { label: string; tone: string } {
  const canonical = canonStatus(status);
  if (canonical.includes("EVALUATED")) return { label: "Review", tone: "w-fit rounded-full bg-brand-secondary/15 px-2 py-1 text-[11px] font-medium text-brand-secondary" };
  if (canonical.includes("INTERVIEW")) return { label: "Interview", tone: "w-fit rounded-full bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand-text" };
  if (canonical.includes("APPLIED")) return { label: "Follow up", tone: "w-fit rounded-full bg-violet-500/15 px-2 py-1 text-[11px] font-medium text-violet-300" };
  if (canonical.includes("OFFER")) return { label: "Offer", tone: "w-fit rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300" };
  return { label: status || "Tracked", tone: "w-fit rounded-full bg-surface-hover px-2 py-1 text-[11px] font-medium text-muted" };
}

function Section({ icon: Icon, title, hint, children }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-brand" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="text-xs text-faint">· {hint}</span>
      </div>
      {children}
    </section>
  );
}
