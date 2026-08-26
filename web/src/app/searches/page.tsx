import Link from "next/link";
import { BellRing, Building2, Compass, MapPin, Radar, SearchCheck } from "lucide-react";
import { careerOpsRoot, pipelineSummary } from "@/lib/career-ops";
import { readSearchWorkspace } from "@/lib/workspace-index.mjs";

export const dynamic = "force-dynamic";

export default function SearchesPage() {
  const search = readSearchWorkspace(careerOpsRoot());
  const { inbox } = pipelineSummary();
  const pending = inbox.filter((job) => !job.done).length;
  const enabledQueries = search.queries.filter((query: { enabled: boolean }) => query.enabled);
  const enabledCompanies = search.companies.filter((company: { enabled: boolean }) => company.enabled);

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Discovery workspace</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-landing">Saved searches & alerts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your durable search rules, watched companies, and roles waiting for review—all rendered from the scanner contract.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portals" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-hover">
            Manage sources
          </Link>
          <Link href="/explore" className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-200">
            <Radar className="size-4" /> Run discovery
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={search.include.length} label="role targets" icon={SearchCheck} />
        <Stat value={enabledQueries.length} label="broad searches" icon={Compass} />
        <Stat value={enabledCompanies.length} label="watched companies" icon={Building2} />
        <Stat value={pending} label="alerts to review" icon={BellRing} accent={pending > 0} />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.95fr)]">
        <div className="grid gap-4">
          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Primary role search</h2>
                <p className="mt-0.5 text-xs text-muted">Applied to every portal scan</p>
              </div>
              <span className={search.configured ? "rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold text-brand-text" : "rounded-full bg-brand-secondary/10 px-2 py-1 text-[10px] font-semibold text-brand-secondary"}>
                {search.configured ? "Active" : "Not configured"}
              </span>
            </div>

            <RuleSet label="Include roles" values={search.include} empty="No positive role keywords yet" tone="positive" />
            <RuleSet label="Exclude roles" values={search.exclude} empty="No exclusions" />
            <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <RuleSet label="Preferred locations" values={[...search.alwaysAllow, ...search.locations]} empty="Any location" icon={MapPin} />
              <RuleSet label="Blocked locations" values={[...search.blockHard, ...search.blockedLocations]} empty="No blocked locations" />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <h2 className="text-base font-semibold">Broad discovery searches</h2>
            <p className="mt-0.5 text-xs text-muted">Named search queries that complement the company watchlist</p>
            {search.queries.length ? (
              <div className="mt-4 divide-y divide-border">
                {search.queries.map((query: { name: string; query: string; enabled: boolean }) => (
                  <div key={`${query.name}-${query.query}`} className="grid gap-2 py-3 md:grid-cols-[minmax(10rem,.45fr)_minmax(0,1fr)_auto] md:items-center">
                    <span className="text-sm font-medium">{query.name}</span>
                    <code className="truncate text-xs text-muted" title={query.query}>{query.query}</code>
                    <span className={query.enabled ? "w-fit rounded-full bg-brand-soft px-2 py-1 text-[10px] font-medium text-brand-text" : "w-fit rounded-full bg-surface-hover px-2 py-1 text-[10px] text-faint"}>
                      {query.enabled ? "Enabled" : "Paused"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="No broad queries are configured. Your role and company rules still drive portal scans." />
            )}
          </section>
        </div>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-secondary">Alert inbox</p>
            <h2 className="mt-2 text-xl font-semibold">{pending ? `${pending} role${pending === 1 ? "" : "s"} need review` : "No unreviewed alerts"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              A scan materializes matching roles in the Jobs inbox. The dashboard never maintains a competing alert store.
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-brand-secondary/15 pt-4 text-xs">
              <span className="text-muted">Last discovered posting</span>
              <span className="font-medium tabular-nums">{search.lastScanDate ?? "No scan history"}</span>
            </div>
            <Link href="/pipeline?tab=INBOX" className="mt-4 inline-flex w-full justify-center rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-200">
              Review alerts
            </Link>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold">Company watchlist</h2><p className="mt-0.5 text-xs text-muted">Direct ATS and careers-page sources</p></div>
              <span className="text-xs tabular-nums text-faint">{enabledCompanies.length} active</span>
            </div>
            {search.companies.length ? (
              <div className="mt-3 max-h-[32rem] divide-y divide-border overflow-y-auto pr-1">
                {search.companies.map((company: { name: string; provider: string; target: string; enabled: boolean }) => (
                  <div key={`${company.name}-${company.target}`} className="flex items-center gap-3 py-3">
                    <span className={company.enabled ? "size-2 rounded-full bg-brand" : "size-2 rounded-full bg-faint"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{company.name}</div>
                      <div className="truncate text-xs text-faint">{company.provider || "auto"}{company.target ? ` · ${company.target}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty text="No companies are watched yet." />}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ value, label, icon: Icon, accent }: { value: number; label: string; icon: typeof SearchCheck; accent?: boolean }) {
  return <div className="rounded-xl border border-border bg-surface/65 p-4"><div className="flex items-start justify-between"><span className={accent ? "text-2xl font-semibold tabular-nums text-brand-secondary" : "text-2xl font-semibold tabular-nums"}>{value}</span><Icon className="size-4 text-faint" /></div><p className="mt-1 text-xs text-faint">{label}</p></div>;
}

function RuleSet({ label, values, empty, tone, icon: Icon }: { label: string; values: string[]; empty: string; tone?: "positive"; icon?: typeof MapPin }) {
  return <div className="mt-4"><p className="flex items-center gap-1.5 text-xs font-medium text-muted">{Icon && <Icon className="size-3.5" />}{label}</p><div className="mt-2 flex flex-wrap gap-1.5">{values.length ? values.map((value) => <span key={`${label}-${value}`} className={tone === "positive" ? "rounded-md border border-brand/20 bg-brand-soft px-2 py-1 text-xs text-brand-text" : "rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted"}>{value}</span>) : <span className="text-xs text-faint">{empty}</span>}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-faint">{text}</div>;
}
