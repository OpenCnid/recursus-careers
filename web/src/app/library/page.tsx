import { FileArchive, FileCheck2, FileText, FolderOpen } from "lucide-react";
import { careerOpsRoot } from "@/lib/career-ops";
import { readDocumentLibrary } from "@/lib/workspace-index.mjs";
import { LibraryView, type LibraryFile } from "@/components/library/library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const files: LibraryFile[] = readDocumentLibrary(careerOpsRoot());
  const params = await searchParams;
  const sourceCount = files.filter((file) => ["Profile sources", "Source documents", "Writing samples"].includes(file.group)).length;
  const generatedCount = files.filter((file) => ["Application documents", "Evaluation reports"].includes(file.group)).length;
  const pdfCount = files.filter((file) => file.extension === "pdf").length;

  return (
    <div className="mx-auto max-w-[86rem] px-5 py-7 sm:px-7 lg:px-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Local artifact workspace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-landing">Document library</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Source material, evaluation reports, tailored application documents, and interview preparation—indexed locally without uploading your files.</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={files.length} label="indexed artifacts" icon={FolderOpen} />
        <Stat value={sourceCount} label="source documents" icon={FileText} />
        <Stat value={generatedCount} label="generated artifacts" icon={FileCheck2} />
        <Stat value={pdfCount} label="PDF documents" icon={FileArchive} />
      </div>
      <LibraryView files={files} initialGroup={params.group ?? "All files"} />
    </div>
  );
}

function Stat({ value, label, icon: Icon }: { value: number; label: string; icon: typeof FolderOpen }) {
  return <div className="rounded-xl border border-border bg-surface/65 p-4"><div className="flex items-start justify-between"><span className="text-2xl font-semibold tabular-nums">{value}</span><Icon className="size-4 text-faint" /></div><p className="mt-1 text-xs text-faint">{label}</p></div>;
}
