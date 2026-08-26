import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Mail, Network, Phone, UserRoundSearch, UsersRound } from "lucide-react";
import { careerOpsRoot, pipelineSummary } from "@/lib/career-ops";
import { canonStatus, scoreNum } from "@/lib/format";
import { readContacts } from "@/lib/workspace-index.mjs";

export const dynamic = "force-dynamic";

const FINISHED = ["REJECTED", "DISCARDED", "SKIP", "HIRED"];

export default function ContactsPage() {
  const contacts = readContacts(careerOpsRoot());
  const { applications } = pipelineSummary();
  const targetJobs = applications
    .filter((app) => scoreNum(app.score) >= 4 && !FINISHED.some((status) => canonStatus(app.status).includes(status)))
    .sort((a, b) => scoreNum(b.score) - scoreNum(a.score));
  const linked = contacts.filter((contact: { tracker: string }) => contact.tracker && contact.tracker !== "-").length;
  const companies = new Set(contacts.map((contact: { company: string }) => contact.company).filter(Boolean)).size;
  const contactable = contacts.filter((contact: { email: string; phone: string; linkedin: string }) => contact.email || contact.phone || contact.linkedin).length;

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Relationship workspace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-landing">Contacts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">The people around each opportunity—hiring managers, recruiters, and peers—without turning outreach into automated sending.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={contacts.length} label="saved contacts" icon={UsersRound} />
        <Stat value={companies} label="companies covered" icon={BriefcaseBusiness} />
        <Stat value={linked} label="linked to jobs" icon={Network} />
        <Stat value={contactable} label="with a contact channel" icon={Mail} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.65fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface/65">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div><h2 className="text-base font-semibold">Relationship directory</h2><p className="mt-0.5 text-xs text-muted">Confirmed contacts saved by the Contacto workflow</p></div>
            <span className="text-xs tabular-nums text-faint">{contacts.length} total</span>
          </div>
          {contacts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-left text-sm">
                <thead className="border-b border-border bg-surface/40 text-[10px] uppercase tracking-[0.12em] text-faint">
                  <tr><th className="px-5 py-3 font-medium">Person</th><th className="px-3 py-3 font-medium">Relationship</th><th className="px-3 py-3 font-medium">Company</th><th className="px-3 py-3 font-medium">Job</th><th className="px-5 py-3 font-medium">Reach</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contacts.map((contact: Contact) => (
                    <tr key={`${contact.name}-${contact.company}`} className="transition hover:bg-surface-hover/50">
                      <td className="px-5 py-3.5"><div className="font-medium">{contact.name}</div><div className="mt-0.5 text-xs text-faint">{contact.title || "Title not recorded"}</div></td>
                      <td className="px-3 py-3.5"><span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] font-medium capitalize text-brand-text">{contact.type || "contact"}</span></td>
                      <td className="px-3 py-3.5 text-muted">{contact.company || "—"}</td>
                      <td className="px-3 py-3.5">{contact.tracker && contact.tracker !== "-" ? <Link href={`/pipeline/${encodeURIComponent(contact.tracker)}`} className="text-brand hover:underline">#{contact.tracker}</Link> : <span className="text-faint">Unlinked</span>}</td>
                      <td className="px-5 py-3.5"><ContactChannels contact={contact} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <UserRoundSearch className="mx-auto size-8 text-brand" />
              <h3 className="mt-3 text-base font-semibold">No confirmed contacts yet</h3>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted">Contact discovery remains confirmation-gated. Once you choose a hiring manager, recruiter, or peer in Recursus, the saved person appears here.</p>
            </div>
          )}
        </section>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-secondary">Guided workflow</p>
            <h2 className="mt-2 text-lg font-semibold">From application to conversation</h2>
            <ol className="mt-4 space-y-4">
              <Step n="1" title="Choose a strong role" detail="Prioritize a scored application with a clear candidate angle." />
              <Step n="2" title="Research three contact types" detail="Hiring manager, recruiter, and team peer each serve a different purpose." />
              <Step n="3" title="Confirm who to save" detail="The contact ledger changes only after your explicit confirmation." />
              <Step n="4" title="Draft—never auto-send" detail="Review the short message yourself before using any external channel." />
            </ol>
          </section>

          <section className="rounded-xl border border-border bg-surface/65 p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Best roles to research</h2><p className="mt-0.5 text-xs text-muted">Active applications scoring 4.0+</p></div><span className="text-xs tabular-nums text-faint">{targetJobs.length}</span></div>
            <div className="mt-3 divide-y divide-border">
              {targetJobs.slice(0, 6).map((app) => (
                <Link key={app.n} href={`/pipeline/${app.n}`} className="group flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{app.company}</div><div className="truncate text-xs text-faint">{app.role} · {app.score}</div></div>
                  <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              ))}
              {!targetJobs.length && <p className="py-5 text-center text-sm text-faint">No active 4.0+ roles yet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type Contact = { name: string; company: string; type: string; title: string; phone: string; email: string; linkedin: string; tracker: string; notes: string };

function ContactChannels({ contact }: { contact: Contact }) {
  const linkedin = /^https:\/\/(?:[a-z]+\.)?linkedin\.com\//i.test(contact.linkedin);
  if (!contact.email && !contact.phone && !contact.linkedin) return <span className="text-xs text-faint">No channel saved</span>;
  return <div className="flex items-center gap-2 text-xs text-muted">{contact.email && <span title={contact.email}><Mail className="size-3.5" /></span>}{contact.phone && <span title={contact.phone}><Phone className="size-3.5" /></span>}{linkedin ? <a href={contact.linkedin} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">LinkedIn</a> : contact.linkedin ? <span>LinkedIn saved</span> : null}</div>;
}

function Stat({ value, label, icon: Icon }: { value: number; label: string; icon: typeof UsersRound }) {
  return <div className="rounded-xl border border-border bg-surface/65 p-4"><div className="flex items-start justify-between"><span className="text-2xl font-semibold tabular-nums">{value}</span><Icon className="size-4 text-faint" /></div><p className="mt-1 text-xs text-faint">{label}</p></div>;
}

function Step({ n, title, detail }: { n: string; title: string; detail: string }) {
  return <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-brand-secondary/30 bg-brand-secondary/10 text-[11px] font-semibold text-brand-secondary">{n}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted">{detail}</p></div></li>;
}
