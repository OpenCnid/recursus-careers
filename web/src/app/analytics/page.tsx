import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { pipelineSummary } from "@/lib/career-ops";
import { canonStatus, scoreNum } from "@/lib/format";
import { cumulativeTiles } from "@/lib/funnel-tiles.mjs";

export const dynamic = "force-dynamic";

const STAGES: { key: string; label: string }[] = [
  { key: "EVALUATED", label: "Evaluated" },
  { key: "APPLIED", label: "Applied" },
  { key: "RESPONDED", label: "Responded" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "OFFER", label: "Offer" },
  { key: "HIRED", label: "Hired" },
  { key: "REJECTED", label: "Rejected" },
  { key: "DISCARDED", label: "Discarded" },
];

export default function Analytics() {
  const { applications } = pipelineSummary();
  const total = applications.length;

  const stageCounts = STAGES.map((s) => ({
    ...s,
    n: applications.filter((a) => canonStatus(a.status).includes(s.key)).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.n));

  const scores = applications.map((a) => scoreNum(a.score)).filter((n) => !Number.isNaN(n));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const buckets = [
    { label: "4.5 – 5.0", test: (n: number) => n >= 4.5 },
    { label: "4.0 – 4.4", test: (n: number) => n >= 4 && n < 4.5 },
    { label: "3.0 – 3.9", test: (n: number) => n >= 3 && n < 4 },
    { label: "< 3.0", test: (n: number) => n < 3 },
  ].map((b) => ({ label: b.label, n: scores.filter(b.test).length }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));

  const companyCounts = new Map<string, number>();
  for (const a of applications) if (a.company) companyCounts.set(a.company, (companyCounts.get(a.company) ?? 0) + 1);
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCompany = Math.max(1, ...topCompanies.map((c) => c[1]));

  // CUMULATIVE, unlike the stage bars above: these two tiles are achievement
  // counters whose zero-state shows a coaching nudge, so a candidate who has
  // already advanced past a stage must not read 0 for it (an offer-holder was
  // told "Interviews follow replies — keep follow-ups warm"). Mirrors
  // everInterview/everOffer in stats.mjs's computeFunnel().
  const { interviews, offers } = cumulativeTiles(applications.map((a) => canonStatus(a.status)));
  const strongWaiting = applications.filter((a) => scoreNum(a.score) >= 4 && canonStatus(a.status).includes("EVALUATED") && !a.pdf.includes("✅")).length;
  const missingStatus = applications.filter((a) => !a.status || a.status === "—").length;
  const missingReports = applications.filter((a) => scoreNum(a.score) > 0 && (!a.report || a.report === "—")).length;
  const missingPdfs = applications.filter((a) => scoreNum(a.score) >= 4 && !a.pdf.includes("✅")).length;
  const healthIssues = missingStatus + missingReports + missingPdfs;

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-landing">Job search analytics</h1>
      <p className="mt-1 text-sm text-muted">Conversion, score patterns, and data health across {total} tracked evaluations.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={total} label="evaluated" />
        <Stat value={avg ? avg.toFixed(2) : "—"} label="avg score" />
        <Stat
          value={interviews}
          label="interviews"
          hint={interviews === 0 ? "Interviews follow replies — keep follow-ups warm →" : undefined}
        />
        <Stat
          value={offers}
          label="offers"
          hint={offers === 0 ? "Offers follow interviews — keep the conversations going →" : undefined}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.7fr)]">
        <div className="grid gap-4">
          <Section title="Current stage mix" subtitle="Where every tracked application is now">
            {stageCounts.map((s) => (
              <Bar
                key={s.key}
                label={s.label}
                value={s.n}
                pct={(s.n / maxStage) * 100}
                total={total}
                tone={s.key === "OFFER" ? "positive" : "neutral"}
              />
            ))}
          </Section>

          <Section title="Score distribution" subtitle="The report score remains holistic, not an arithmetic formula">
            {buckets.map((b) => (
              <Bar key={b.label} label={b.label} value={b.n} pct={(b.n / maxBucket) * 100} total={scores.length} />
            ))}
          </Section>
        </div>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-secondary">Biggest bottleneck</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {strongWaiting > 0 ? `${strongWaiting} strong job${strongWaiting === 1 ? " is" : "s are"} waiting before the tailored PDF` : "No strong evaluations are stalled"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">Jobs scoring 4.0 or higher should either advance through review or receive an explicit outcome.</p>
            <Link href="/pipeline?tab=EVALUATED&min=4" className="mt-4 inline-flex rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-200">Review waiting jobs</Link>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-4">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Pipeline health</h2><p className="mt-0.5 text-xs text-muted">Completeness of tracker artifacts</p></div><span className={healthIssues > 0 ? "text-xs font-medium text-brand-secondary" : "text-xs font-medium text-brand-text"}>{healthIssues} issues</span></div>
            <div className="mt-3 divide-y divide-border">
              <HealthRow label="Tracker rows" value={missingStatus ? `${missingStatus} missing status` : "Complete"} issue={missingStatus > 0} />
              <HealthRow label="Evaluation reports" value={missingReports ? `${missingReports} missing` : "Complete"} issue={missingReports > 0} />
              <HealthRow label="Application PDFs" value={missingPdfs ? `${missingPdfs} pending` : "Current"} issue={missingPdfs > 0} />
            </div>
          </section>

          <Section title="Top companies" subtitle="Most frequently evaluated" id="companies">
            {topCompanies.map(([name, n]) => (
              <Bar key={name} label={name} value={n} pct={(n / maxCompany) * 100} />
            ))}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ value, label, hint }: { value: number | string; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/65 p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-faint">{label}</div>
      {hint && (
        <Link href="/" className="mt-2 block text-xs text-muted transition-colors hover:text-brand">
          {hint}
        </Link>
      )}
    </div>
  );
}

function Section({ title, subtitle, children, id }: { title: string; subtitle?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-8 rounded-xl border border-border bg-surface/65 p-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4 space-y-2.5">{children}</div>
    </section>
  );
}

function HealthRow({ label, value, issue }: { label: string; value: string; issue: boolean }) {
  const Icon = issue ? AlertCircle : CheckCircle2;
  return (
    <div className="flex items-center gap-2 py-2.5 text-xs">
      <Icon className={issue ? "size-4 text-brand-secondary" : "size-4 text-brand"} />
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-auto text-right text-muted">{value}</span>
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  total,
  tone = "neutral",
}: {
  label: string;
  value: number;
  pct: number;
  total?: number;
  tone?: "neutral" | "positive";
}) {
  const share = total && total > 0 ? Math.round((value / total) * 100) : null;
  const fill =
    tone === "positive"
      ? "bg-gradient-to-r from-emerald-500/60 to-emerald-500/30"
      : "bg-gradient-to-r from-foreground/25 to-foreground/10";
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 truncate text-sm text-muted">{label}</div>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-surface">
        <div
          className={`h-full rounded-md ${fill}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-sm tabular-nums">
        {value}
        {share !== null && <span className="ml-1 text-xs text-faint">{share}%</span>}
      </div>
    </div>
  );
}
