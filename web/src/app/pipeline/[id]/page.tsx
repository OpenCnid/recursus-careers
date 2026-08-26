import { notFound } from "next/navigation";
import { careerOpsRoot, readReport, findApplication, trackerCanDelete } from "@/lib/career-ops";
import { JobWorkspace } from "@/components/job/job-workspace";
import { readContacts, readDocumentLibrary, readInterviewWorkspace } from "@/lib/workspace-index.mjs";
import {
  artifactsForJob,
  contactsForJob,
  interviewForJob,
  readPdfManifestForJob,
  reportNumberForJob,
} from "@/lib/job-workspace.mjs";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = findApplication(id);
  const report = readReport(id);
  if (!app && !report) notFound();
  const root = careerOpsRoot();
  const allContacts = readContacts(root);
  const allDocuments = readDocumentLibrary(root);
  const interviewWorkspace = readInterviewWorkspace(root);
  const reportNumber = reportNumberForJob(app, report?.file ?? null);
  const manifestPaths = readPdfManifestForJob(root, reportNumber);

  return (
    <JobWorkspace
      id={id}
      app={app}
      report={report?.content ?? null}
      reportFile={report?.file ?? null}
      canDelete={trackerCanDelete()}
      contacts={app ? contactsForJob(allContacts, app) : []}
      artifacts={app ? artifactsForJob(allDocuments, app, report?.file ?? null, manifestPaths) : []}
      interview={app ? interviewForJob(interviewWorkspace, app) : { shared: [], roleArtifacts: [], sessions: [] }}
    />
  );
}
