import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  Check,
  Circle,
  ExternalLink,
  FileCheck2,
  FileText,
  LockKeyhole,
  Mail,
  MessagesSquare,
  Phone,
  UsersRound,
} from "lucide-react";
import type { Application } from "@/lib/career-ops";
import { canonStatus, legitimacyTone, parseReport, scoreNum, scoreTone } from "@/lib/format";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { StatusSelect } from "@/components/status-select";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { ApplyButton } from "@/components/apply-button";
import { DeleteFromTracker } from "@/components/delete-from-tracker";
import { ReportView } from "@/components/report-view";
import { JobFollowupPanel } from "@/components/job/job-followup-panel";

type Contact = { name: string; company: string; type: string; title: string; phone: string; email: string; linkedin: string; tracker: string; notes: string };
type Artifact = { name: string; path: string; extension: string; size: number; updatedAt: string; group: string };
type PrepArtifact = { name: string; path: string; kind: string; entries: number; updatedAt: string };
type Session = { name: string; path: string; company: string; role: string; round: string; date: string; source: string; questions: number; updatedAt: string };

export function JobWorkspace({
  id,
  app,
  report,
  reportFile,
  canDelete,
  contacts,
  artifacts,
  interview,
}: {
  id: string;
  app: Application | null;
  report: string | null;
  reportFile: string | null;
  canDelete: boolean;
  contacts: Contact[];
  artifacts: Artifact[];
  interview: { shared: PrepArtifact[]; roleArtifacts: PrepArtifact[]; sessions: Session[] };
}) {
  const meta = report ? parseReport(report) : null;
  const field = (label: string) => meta?.fields.find((item) => item.label === label)?.value;
  const company = app?.company ?? meta?.title ?? `Application #${id}`;
  const role = app?.role ?? "Role not recorded";
  const score = app?.score || field("Score") || "";
  const date = app?.date || field("Date");
  const url = field("URL");
  const pdfReady = (app?.pdf ?? "").includes("✅");
  const pdfArtifacts = artifacts.filter((artifact) => artifact.extension === "pdf");
  const documentCount = artifacts.length + (pdfReady && pdfArtifacts.length === 0 ? 1 : 0);
  const prepCount = interview.roleArtifacts.length + interview.sessions.length;
  const next = nextAction(app, score, pdfReady, contacts.length, prepCount, !!report);

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-6 sm:px-7 lg:px-8">
      <Link href="/pipeline" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-brand"><ArrowLeft className="size-4" /> All jobs</Link>

      <header className="mt-4 rounded-2xl border border-border bg-surface/55 p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyLogo name={company} size={48} />
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-faint">Application #{id}</p>
              <h1 className="mt-1 truncate font-display text-3xl font-semibold tracking-tight text-landing">{company}</h1>
              <p className="mt-1 text-sm text-muted">{role}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {score && <Badge tone={scoreTone(score)}>{score}</Badge>}
                {!Number.isNaN(scoreNum(score)) && <Badge tone={scoreNum(score) >= 4 ? "good" : "muted"}>{scoreNum(score) >= 4 ? "Recommended" : "Below apply line"}</Badge>}
                {meta?.legitimacy && <Badge tone={legitimacyTone(meta.legitimacy)}>{meta.legitimacy}</Badge>}
                {date && <span className="text-xs tabular-nums text-faint">Evaluated {date}</span>}
                {url?.startsWith("http") && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Posting <ExternalLink className="size-3" /></a>}
              </div>
            </div>
          </div>
          {app && <div className="flex max-w-xl flex-wrap items-center justify-end gap-2"><StatusSelect n={id} current={app.status} />{report ? <GeneratePdfButton n={id} company={company} pdfReady={pdfReady} /> : <span title="The evaluation report is required before tailoring" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-faint"><LockKeyhole className="size-3.5" /> Report needed for CV</span>}<ApplyButton n={id} url={url?.startsWith("http") ? url : undefined} company={company} pdfReady={pdfReady} /></div>}
        </div>
        {app && <StageRail status={app.status} />}
      </header>

      <nav aria-label="Job workspace sections" className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/45 p-1">
        {[["#evaluation", "Evaluation"], ["#documents", "Documents"], ["#contacts", "Contacts"], ["#follow-up", "Follow-up"], ["#interview", "Interview prep"]].map(([href, label]) => <a key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground">{label}</a>)}
      </nav>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Snapshot label="Evaluation" value={score || "—"} detail={report ? "Report available" : "Report missing"} icon={FileText} />
        <Snapshot label="Documents" value={documentCount} detail={pdfReady ? "Tailored CV ready" : "CV still pending"} icon={FileCheck2} />
        <Snapshot label="Contacts" value={contacts.length} detail={contacts.length ? "Relationship context saved" : "None confirmed"} icon={UsersRound} />
        <Snapshot label="Follow-up" value={app && /APPLIED|RESPONDED|INTERVIEW/.test(canonStatus(app.status)) ? "Active" : "—"} detail="Core cadence" icon={CalendarClock} />
        <Snapshot label="Interview" value={prepCount} detail={`${interview.roleArtifacts.length} prep · ${interview.sessions.length} sessions`} icon={MessagesSquare} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(21rem,.65fr)]">
        <main id="evaluation" className="scroll-mt-20 rounded-xl border border-border bg-surface/55 p-5 lg:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand">Decision evidence</p><h2 className="mt-1 text-xl font-semibold">Evaluation report</h2></div>{reportFile && <a href={`/api/library/file?path=${encodeURIComponent(`reports/${reportFile}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-brand"><ExternalLink className="size-3.5" /> Raw report</a>}</div>
          <ReportView id={id} app={app} report={report} embedded />
        </main>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-secondary">Recommended next</p>
            <h2 className="mt-2 text-lg font-semibold">{next.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{next.body}</p>
            <a href={next.href} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-200">{next.label} <ArrowRight className="size-4" /></a>
          </section>

          <WorkspacePanel id="documents" title="Documents" subtitle="Artifacts tied by report or application identity" icon={FileCheck2}>
            <div className="divide-y divide-border">
              {artifacts.map((artifact) => <ArtifactRow key={artifact.path} artifact={artifact} />)}
              {pdfReady && pdfArtifacts.length === 0 && <a href={`/api/cv-pdf?company=${encodeURIComponent(company)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3"><FileCheck2 className="size-4 text-brand" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Tailored CV</p><p className="text-xs text-faint">Ready · legacy output path</p></div><ExternalLink className="size-3.5 text-faint" /></a>}
              {!artifacts.length && !pdfReady && <Empty text="No application documents have been produced yet." />}
            </div>
            <Link href="/library" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open library <ArrowRight className="size-3.5" /></Link>
          </WorkspacePanel>

          <WorkspacePanel id="contacts" title="Contacts" subtitle="Confirmed people for this application" icon={UsersRound}>
            <div className="divide-y divide-border">
              {contacts.map((contact) => <ContactRow key={`${contact.name}-${contact.company}`} contact={contact} />)}
              {!contacts.length && <Empty text="No hiring manager, recruiter, or peer is linked yet." />}
            </div>
            <Link href="/contacts" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open relationship workspace <ArrowRight className="size-3.5" /></Link>
          </WorkspacePanel>

          {app && <WorkspacePanel id="follow-up" title="Follow-up" subtitle="Computed by the canonical cadence engine" icon={CalendarClock}><JobFollowupPanel appNum={id} company={company} role={role} status={app.status} /></WorkspacePanel>}

          <WorkspacePanel id="interview" title="Interview prep" subtitle="Role-specific packs plus retained practice" icon={BookOpenCheck}>
            <div className="grid grid-cols-2 gap-2 py-2 text-xs"><Readiness label="Role prep pack" ready={interview.roleArtifacts.length > 0} /><Readiness label="Story bank" ready={interview.shared.some((item) => item.kind === "Story bank")} /><Readiness label="Question bank" ready={interview.shared.some((item) => item.kind === "Question bank")} /><Readiness label="Practice/debrief" ready={interview.sessions.length > 0} /></div>
            {[...interview.roleArtifacts, ...interview.sessions].slice(0, 5).map((item) => <a key={item.path} href={`/api/library/file?path=${encodeURIComponent(item.path)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 border-t border-border py-2.5 text-xs text-muted hover:text-brand"><FileText className="size-3.5" /><span className="min-w-0 flex-1 truncate">{item.name}</span><ExternalLink className="size-3" /></a>)}
            <Link href="/interviews" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open interview workspace <ArrowRight className="size-3.5" /></Link>
          </WorkspacePanel>

          {app && canDelete && <details className="rounded-xl border border-border bg-surface/45 p-4"><summary className="cursor-pointer text-xs font-medium text-faint">Application maintenance</summary><div className="mt-3"><DeleteFromTracker n={id} /></div></details>}
        </aside>
      </div>
    </div>
  );
}

const STAGES = ["EVALUATED", "APPLIED", "RESPONDED", "INTERVIEW", "OFFER", "HIRED"];

function StageRail({ status }: { status: string }) {
  const current = canonStatus(status);
  const index = STAGES.findIndex((stage) => current.includes(stage));
  const closed = /REJECTED|DISCARDED|SKIP/.test(current);
  return <div className="mt-5 border-t border-border pt-4"><div className="flex min-w-[36rem] items-center overflow-x-auto">{STAGES.map((stage, i) => { const reached = !closed && index >= i; const active = index === i && !closed; return <div key={stage} className="flex min-w-0 flex-1 items-center"><span className={reached ? "size-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand-soft" : "size-2.5 shrink-0 rounded-full border border-border bg-surface"} /><span className={active ? "ml-2 text-[10px] font-semibold text-brand-text" : "ml-2 text-[10px] text-faint"}>{stage[0] + stage.slice(1).toLowerCase()}</span>{i < STAGES.length - 1 && <span className={reached && index > i ? "mx-3 h-px flex-1 bg-brand/60" : "mx-3 h-px flex-1 bg-border"} />}</div>; })}{closed && <span className="ml-3 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400">{status}</span>}</div></div>;
}

function Snapshot({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof FileText }) {
  return <div className="rounded-xl border border-border bg-surface/55 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted">{label}</p><Icon className="size-4 text-faint" /></div><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 truncate text-[11px] text-faint">{detail}</p></div>;
}

function WorkspacePanel({ id, title, subtitle, icon: Icon, children }: { id: string; title: string; subtitle: string; icon: typeof FileText; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-20 rounded-xl border border-border bg-surface/55 p-4"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/30"><Icon className="size-4 text-brand" /></span><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div></div><div className="mt-3">{children}</div></section>;
}

function ArtifactRow({ artifact }: { artifact: Artifact }) {
  return <a href={`/api/library/file?path=${encodeURIComponent(artifact.path)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3"><FileText className="size-4 text-brand" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{artifact.name}</p><p className="truncate text-xs text-faint">{artifact.group}</p></div><ExternalLink className="size-3.5 text-faint" /></a>;
}

function ContactRow({ contact }: { contact: Contact }) {
  const linkedin = /^https:\/\/(?:[a-z]+\.)?linkedin\.com\//i.test(contact.linkedin);
  return <div className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{contact.name}</p><p className="truncate text-xs text-faint">{contact.title || contact.type || "Contact"}</p></div><span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] capitalize text-brand-text">{contact.type || "contact"}</span></div><div className="mt-2 flex items-center gap-3 text-xs text-muted">{contact.email && <span title={contact.email}><Mail className="size-3.5" /></span>}{contact.phone && <span title={contact.phone}><Phone className="size-3.5" /></span>}{linkedin && <a href={contact.linkedin} target="_blank" rel="noreferrer" className="text-brand hover:underline">LinkedIn</a>}</div></div>;
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  const Icon = ready ? Check : Circle;
  return <div className="flex items-center gap-1.5"><Icon className={ready ? "size-3.5 text-brand" : "size-3.5 text-faint"} /><span className={ready ? "text-foreground" : "text-muted"}>{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm leading-6 text-muted">{text}</p>;
}

function nextAction(app: Application | null, score: string, pdfReady: boolean, contactCount: number, prepCount: number, hasReport: boolean) {
  if (!app) return { title: "Restore the tracker link", body: "This report is not connected to an application row, so downstream workflow state cannot be resolved safely.", href: "/pipeline", label: "Open jobs" };
  const status = canonStatus(app.status);
  const strong = scoreNum(score) >= 4;
  if (!hasReport) return { title: "Restore the evaluation evidence", body: "This tracker row has no report artifact. Complete or recover the evaluation before generating documents or making a decision from the score alone.", href: "#evaluation", label: "Review missing report" };
  if (status.includes("EVALUATED") && strong && !pdfReady) return { title: "Generate the tailored CV", body: "The evaluation clears the apply line. Create the role-specific application document before advancing.", href: "#documents", label: "Review documents" };
  if (status.includes("EVALUATED")) return { title: "Make the application decision", body: strong ? "The evaluation and documents are ready. Review the evidence, then apply or record a deliberate pass." : "This role sits below the apply line. Review the evidence and record the outcome.", href: "#evaluation", label: "Review evidence" };
  if (status.includes("APPLIED") || status.includes("RESPONDED")) return contactCount === 0 ? { title: "Add relationship context", body: "The application is active but no recruiter, hiring manager, or peer is linked yet.", href: "#contacts", label: "Review contacts" } : { title: "Keep the conversation warm", body: "Use the canonical cadence and the saved contact context for the next follow-up.", href: "#follow-up", label: "Review follow-up" };
  if (status.includes("INTERVIEW")) return prepCount === 0 ? { title: "Build the interview pack", body: "The job is at Interview, but no role-specific prep or retained session is attached yet.", href: "#interview", label: "Review preparation" } : { title: "Rehearse the next round", body: "Use the role pack, grounded stories, and prior session evidence to focus the next practice block.", href: "#interview", label: "Open preparation" };
  if (status.includes("OFFER")) return { title: "Evaluate the outcome", body: "Keep the offer, supporting documents, and final decision tied to this application record.", href: "#documents", label: "Review artifacts" };
  if (/HIRED|REJECTED|DISCARDED|SKIP/.test(status)) return { title: "Record complete", body: "This application has a terminal outcome. Its evidence and artifacts remain available for later pattern analysis.", href: "#evaluation", label: "Review record" };
  return { title: "Review the current stage", body: "Confirm the application status and take the next deliberate step in the workflow.", href: "#evaluation", label: "Review job" };
}
