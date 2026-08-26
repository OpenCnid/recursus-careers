import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarClock, Check, Circle, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { careerOpsRoot, pipelineSummary, type Application } from "@/lib/career-ops";
import { canonStatus, scoreNum } from "@/lib/format";
import { readInterviewWorkspace } from "@/lib/workspace-index.mjs";

export const dynamic = "force-dynamic";

type PrepArtifact = { name: string; path: string; kind: string; entries: number; updatedAt: string };
type Session = { name: string; path: string; company: string; role: string; round: string; date: string; source: string; questions: number; updatedAt: string };

export default function InterviewsPage() {
  const { artifacts, sessions }: { artifacts: PrepArtifact[]; sessions: Session[] } = readInterviewWorkspace(careerOpsRoot());
  const { applications } = pipelineSummary();
  const interviewJobs = applications.filter((app) => canonStatus(app.status).includes("INTERVIEW"));
  const readyJobs = applications
    .filter((app) => scoreNum(app.score) >= 4 && ["APPLIED", "RESPONDED"].some((status) => canonStatus(app.status).includes(status)))
    .sort((a, b) => scoreNum(b.score) - scoreNum(a.score));
  const stories = artifacts.find((artifact) => artifact.kind === "Story bank");

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Preparation workspace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-landing">Interview prep</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Turn each interview-stage job into a prepared conversation, then retain what you learn across practice and real rounds.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={interviewJobs.length} label="active interviews" icon={CalendarClock} accent={interviewJobs.length > 0} />
        <Stat value={artifacts.filter((a) => a.kind === "Prep pack").length} label="role prep packs" icon={BookOpenCheck} />
        <Stat value={sessions.length} label="recorded sessions" icon={MessageSquareText} />
        <Stat value={stories?.entries ?? 0} label="story-bank sections" icon={Sparkles} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(21rem,.7fr)]">
        <div className="grid gap-4">
          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Interview readiness</h2><p className="mt-0.5 text-xs text-muted">A visible checklist for every job currently at Interview</p></div><span className="text-xs tabular-nums text-faint">{interviewJobs.length} active</span></div>
            {interviewJobs.length ? (
              <div className="mt-4 grid gap-3">
                {interviewJobs.map((app) => <ReadinessCard key={app.n} app={app} artifacts={artifacts} sessions={sessions} />)}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                <CalendarClock className="mx-auto size-7 text-brand" />
                <h3 className="mt-3 text-base font-semibold">No job is at Interview yet</h3>
                <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted">When a tracked job advances, its report, story bank, role prep, practice, and debrief state will collect here.</p>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface/65">
            <div className="flex items-start justify-between gap-3 border-b border-border p-5"><div><h2 className="text-base font-semibold">Session history</h2><p className="mt-0.5 text-xs text-muted">Practice and debrief transcripts retained for downstream learning</p></div><span className="text-xs tabular-nums text-faint">{sessions.length}</span></div>
            {sessions.length ? (
              <div className="divide-y divide-border">
                {sessions.map((session) => (
                  <div key={session.path} className="grid gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_9rem_7rem_5rem] md:items-center">
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{session.company} · {session.role}</div><div className="mt-0.5 truncate text-xs text-faint">{session.path}</div></div>
                    <span className="text-xs capitalize text-muted">{session.round}</span>
                    <span className="text-xs tabular-nums text-muted">{session.date}</span>
                    <span className="text-right text-xs tabular-nums text-faint">{session.questions} Qs</span>
                  </div>
                ))}
              </div>
            ) : <p className="px-5 py-10 text-center text-sm text-faint">No practice or debrief sessions have been recorded.</p>}
          </section>
        </div>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-secondary">Preparation loop</p>
            <h2 className="mt-2 text-lg font-semibold">Research → rehearse → learn</h2>
            <div className="mt-4 space-y-3">
              <LoopStep title="Company intelligence" detail="Build a sourced role pack from the evaluation and current interview process." />
              <LoopStep title="Time-blocked plan" detail="Focus finite prep time on gaps, likely questions, and the next round." />
              <LoopStep title="Practice with proof" detail="Answer from grounded STAR+R stories and record the session." />
              <LoopStep title="Debrief the real round" detail="Update question gaps and story material while details are fresh." />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Likely next interviews</h2><p className="mt-0.5 text-xs text-muted">Strong active applications to keep warm</p></div><span className="text-xs tabular-nums text-faint">{readyJobs.length}</span></div>
            <div className="mt-3 divide-y divide-border">
              {readyJobs.slice(0, 6).map((app) => (
                <Link key={app.n} href={`/pipeline/${app.n}`} className="group flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{app.company}</div><div className="truncate text-xs text-faint">{app.role} · {app.status}</div></div>
                  <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              ))}
              {!readyJobs.length && <p className="py-5 text-center text-sm text-faint">No 4.0+ applied jobs are waiting.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Preparation library</h2><p className="mt-0.5 text-xs text-muted">Durable interview artifacts</p></div><ShieldCheck className="size-4 text-brand" /></div>
            <div className="mt-3 divide-y divide-border">
              {artifacts.slice(0, 8).map((artifact) => <div key={artifact.path} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{artifact.name}</div><div className="text-xs text-faint">{artifact.kind}</div></div><span className="text-xs tabular-nums text-faint">{artifact.entries}</span></div>)}
              {!artifacts.length && <p className="py-5 text-center text-sm text-faint">No prep artifacts yet.</p>}
            </div>
            <Link href="/library?group=Interview%20preparation" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">View in document library <ArrowRight className="size-3.5" /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReadinessCard({ app, artifacts, sessions }: { app: Application; artifacts: PrepArtifact[]; sessions: Session[] }) {
  const slug = app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hasReport = !!app.report && app.report !== "—";
  const hasStoryBank = artifacts.some((artifact) => artifact.kind === "Story bank");
  const hasRolePrep = artifacts.some((artifact) => artifact.kind === "Prep pack" && artifact.path.toLowerCase().includes(slug));
  const hasSession = sessions.some((session) => session.company.toLowerCase() === app.company.toLowerCase() || session.path.toLowerCase().includes(slug));
  const checks = [["Evaluation context", hasReport], ["Role research pack", hasRolePrep], ["Grounded story bank", hasStoryBank], ["Practice or debrief", hasSession]] as const;
  const complete = checks.filter(([, done]) => done).length;
  return (
    <div className="rounded-xl border border-border bg-background/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/pipeline/${app.n}`} className="text-base font-semibold hover:text-brand">{app.company} · {app.role}</Link><p className="mt-0.5 text-xs text-muted">Application #{app.n} · {app.score}</p></div><span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand-text">{complete}/4 ready</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{checks.map(([label, done]) => { const Icon = done ? Check : Circle; return <div key={label} className="flex items-center gap-2 text-xs"><Icon className={done ? "size-4 text-brand" : "size-4 text-faint"} /><span className={done ? "text-foreground" : "text-muted"}>{label}</span></div>; })}</div>
    </div>
  );
}

function Stat({ value, label, icon: Icon, accent }: { value: number; label: string; icon: typeof CalendarClock; accent?: boolean }) {
  return <div className="rounded-xl border border-border bg-surface/65 p-4"><div className="flex items-start justify-between"><span className={accent ? "text-2xl font-semibold tabular-nums text-brand-secondary" : "text-2xl font-semibold tabular-nums"}>{value}</span><Icon className="size-4 text-faint" /></div><p className="mt-1 text-xs text-faint">{label}</p></div>;
}

function LoopStep({ title, detail }: { title: string; detail: string }) {
  return <div className="border-l border-brand-secondary/35 pl-3"><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted">{detail}</p></div>;
}
