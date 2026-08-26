"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Clock3, Loader2, MessageSquarePlus } from "lucide-react";
import { LogDialog } from "@/components/followups/log-dialog";
import { type CadenceEntry, urgencyTone } from "@/lib/followups";
import { Badge } from "@/components/ui/badge";
import { canonStatus } from "@/lib/format";

export function JobFollowupPanel({ appNum, company, role, status }: { appNum: string; company: string; role: string; status: string }) {
  const [entry, setEntry] = useState<CadenceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [logging, setLogging] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/followups?full=1")
      .then((response) => response.json())
      .then((data) => {
        setAvailable(data.available !== false);
        const entries = Array.isArray(data.entries) ? data.entries : [];
        setEntry(entries.find((item: CadenceEntry) => String(item.num) === String(appNum)) ?? null);
      })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, [appNum]);

  useEffect(load, [load]);

  if (loading) return <div className="flex items-center gap-2 py-5 text-sm text-faint"><Loader2 className="size-4 animate-spin" /> Reading follow-up cadence…</div>;

  if (!available) return <p className="py-4 text-sm leading-6 text-muted">The follow-up cadence engine is unavailable in this checkout.</p>;

  if (!entry) {
    const current = canonStatus(status);
    const copy = current.includes("EVALUATED")
      ? "Cadence begins after you mark this job Applied."
      : /REJECTED|DISCARDED|SKIP|HIRED/.test(current)
        ? "Follow-up cadence is closed for this outcome."
        : "No follow-up is currently scheduled for this job.";
    return <div className="py-4"><p className="text-sm text-muted">{copy}</p><Link href="/followups" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open planner <ArrowRight className="size-3.5" /></Link></div>;
  }

  return (
    <>
      <div className="py-3">
        <div className="flex items-center justify-between gap-3">
          <Badge tone={urgencyTone(entry.urgency)}>{entry.urgency}</Badge>
          <span className="text-xs text-faint">{entry.followupCount} logged</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/30 p-3 text-xs">
          <div><p className="text-faint">Next follow-up</p><p className="mt-1 flex items-center gap-1.5 font-medium"><CalendarClock className="size-3.5 text-brand" />{entry.nextFollowupDate ?? "Not scheduled"}</p></div>
          <div><p className="text-faint">Last activity</p><p className="mt-1 flex items-center gap-1.5 font-medium"><Clock3 className="size-3.5 text-brand" />{entry.daysSinceLastFollowup == null ? "None yet" : `${entry.daysSinceLastFollowup}d ago`}</p></div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setLogging(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground hover:bg-brand-200"><MessageSquarePlus className="size-3.5" /> Log follow-up</button>
          <Link href={`/followups?q=${encodeURIComponent(company)}`} className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted hover:bg-surface-hover">Open planner</Link>
        </div>
      </div>
      {logging && <LogDialog entry={entry} onClose={() => setLogging(false)} onLogged={load} />}
    </>
  );
}
