"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, File, FileArchive, FileCode2, FileImage, FileText, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type LibraryFile = {
  name: string;
  path: string;
  extension: string;
  size: number;
  updatedAt: string;
  group: string;
};

export function LibraryView({ files, initialGroup = "All files" }: { files: LibraryFile[]; initialGroup?: string }) {
  const groups = useMemo(() => ["All files", ...new Set(files.map((file) => file.group))], [files]);
  const [group, setGroup] = useState(groups.includes(initialGroup) ? initialGroup : "All files");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files.filter((file) => (group === "All files" || file.group === group) && (!needle || `${file.name} ${file.path} ${file.group}`.toLowerCase().includes(needle)));
  }, [files, group, query]);

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="rounded-xl border border-border bg-surface/65 p-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Collections</p>
        <div className="grid gap-1">
          {groups.map((item) => {
            const count = item === "All files" ? files.length : files.filter((file) => file.group === item).length;
            return (
              <button key={item} onClick={() => setGroup(item)} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition", group === item ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-hover hover:text-foreground")}>
                <span className="min-w-0 flex-1 truncate">{item}</span><span className="text-[11px] tabular-nums opacity-65">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <Link href="/cv" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft">Edit master CV <ExternalLink className="size-3.5" /></Link>
        </div>
      </aside>

      <section className="overflow-hidden rounded-xl border border-border bg-surface/65">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div><h2 className="text-base font-semibold">{group}</h2><p className="mt-0.5 text-xs text-muted">{shown.length} artifact{shown.length === 1 ? "" : "s"}</p></div>
          <label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus-within:border-brand/45 sm:w-72">
            <Search className="size-4 text-faint" /><span className="sr-only">Search documents</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint" />
          </label>
        </div>

        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border bg-surface/40 text-[10px] uppercase tracking-[0.12em] text-faint"><tr><th className="px-4 py-3 font-medium">Document</th><th className="px-3 py-3 font-medium">Collection</th><th className="px-3 py-3 font-medium">Updated</th><th className="px-3 py-3 text-right font-medium">Size</th><th className="px-4 py-3 text-right font-medium">Access</th></tr></thead>
              <tbody className="divide-y divide-border">
                {shown.map((file) => {
                  const Icon = fileIcon(file.extension);
                  const preview = ["md", "txt", "pdf", "png", "jpg", "jpeg", "webp"].includes(file.extension);
                  return (
                    <tr key={file.path} className="transition hover:bg-surface-hover/50">
                      <td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40"><Icon className="size-4 text-brand" /></span><div className="min-w-0"><div className="max-w-md truncate font-medium" title={file.name}>{file.name}</div><div className="mt-0.5 max-w-md truncate font-mono text-[11px] text-faint" title={file.path}>{file.path}</div></div></div></td>
                      <td className="px-3 py-3.5 text-xs text-muted">{file.group}</td>
                      <td className="px-3 py-3.5 text-xs tabular-nums text-muted">{formatDate(file.updatedAt)}</td>
                      <td className="px-3 py-3.5 text-right text-xs tabular-nums text-faint">{formatBytes(file.size)}</td>
                      <td className="px-4 py-3.5 text-right"><a href={`/api/library/file?path=${encodeURIComponent(file.path)}`} target={preview ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-brand/35 hover:text-brand">{preview ? <ExternalLink className="size-3.5" /> : <Download className="size-3.5" />}{preview ? "Open" : "Download"}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="px-6 py-12 text-center"><FileText className="mx-auto size-7 text-brand" /><h3 className="mt-3 text-base font-semibold">No matching documents</h3><p className="mt-1 text-sm text-muted">This collection will populate when the corresponding workflow writes a canonical artifact.</p></div>}
      </section>
    </div>
  );
}

function fileIcon(extension: string) {
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return FileImage;
  if (["html", "tex", "json", "yml", "yaml"].includes(extension)) return FileCode2;
  if (["zip", "gz", "tar"].includes(extension)) return FileArchive;
  if (["md", "txt", "pdf", "doc", "docx"].includes(extension)) return FileText;
  return File;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
