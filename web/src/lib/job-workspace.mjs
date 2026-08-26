import fs from "node:fs";
import path from "node:path";

/** @typedef {{name: string, path: string, extension: string, size: number, updatedAt: string, group: string}} IndexedArtifact */

function key(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value, fallback = "") {
  return key(value).replace(/\s+/g, "-") || fallback;
}

const COMPANY_SUFFIXES = new Set(["inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "company", "gmbh", "ag", "plc"]);

function companyKey(value) {
  const tokens = key(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(" ");
}

function normalizedNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? String(Number(match[0])) : null;
}

/**
 * Resolve the report identity without assuming tracker # === report #.
 * @param {Record<string, any> | null} app
 * @param {string | null} reportFile
 */
export function reportNumberForJob(app, reportFile = null) {
  const fromLink = String(app?.report ?? "").match(/(?:^|\/)0*(\d+)-[^/)]+\.md/i)?.[1];
  const fromFile = path.basename(String(reportFile ?? "")).match(/^0*(\d+)-/)?.[1];
  return normalizedNumber(fromLink ?? fromFile);
}

/**
 * A contact explicitly linked to another application is never borrowed just
 * because the company name matches. Unlinked company contacts are useful
 * candidates; explicit tracker links remain authoritative.
 */
export function contactsForJob(contacts, app) {
  const tracker = normalizedNumber(app?.n);
  const company = companyKey(app?.company);
  return contacts.filter((contact) => {
    const linked = normalizedNumber(contact.tracker);
    if (linked) return linked === tracker;
    return company && companyKey(contact.company) === company;
  });
}

/** Split shared interview knowledge from company/role-specific preparation. */
export function interviewForJob(workspace, app) {
  const targetCompanyKey = companyKey(app?.company);
  const companySlug = targetCompanyKey.replace(/\s+/g, "-");
  const roleTokens = key(app?.role).split(" ").filter((token) => token.length >= 4);
  const sharedKinds = new Set(["Story bank", "Question bank", "Claim guardrail", "Guide"]);
  const shared = workspace.artifacts.filter((artifact) => sharedKinds.has(artifact.kind));
  const roleArtifacts = workspace.artifacts.filter((artifact) => {
    if (sharedKinds.has(artifact.kind)) return false;
    const artifactKey = key(`${artifact.name} ${artifact.path}`);
    const companyMatches = targetCompanyKey && (artifactKey.includes(targetCompanyKey) || artifact.path.toLowerCase().includes(companySlug));
    return companyMatches && (roleTokens.length === 0 || roleTokens.some((token) => artifactKey.includes(token)) || artifact.kind === "Red-flag review");
  });
  const sessions = workspace.sessions.filter((session) => {
    if (companyKey(session.company) === targetCompanyKey) return true;
    return companySlug && session.path.toLowerCase().includes(companySlug);
  });
  return { shared, roleArtifacts, sessions };
}

/** Parse report -> PDF/HTML paths from the canonical data/pdf-index.tsv. */
export function parsePdfManifest(text, reportNumber) {
  const target = normalizedNumber(reportNumber);
  if (!target) return [];
  const paths = new Set();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const [report, pdf, html] = line.split("\t");
    if (normalizedNumber(report) !== target) continue;
    for (const value of [pdf, html]) {
      const relative = String(value ?? "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
      if (relative && !relative.startsWith("/") && !relative.split("/").includes("..")) paths.add(relative);
    }
  }
  return [...paths];
}

export function readPdfManifestForJob(root, reportNumber) {
  try {
    return parsePdfManifest(fs.readFileSync(path.join(root, "data", "pdf-index.tsv"), "utf8"), reportNumber);
  } catch {
    return [];
  }
}

/**
 * Match only identity-bearing documents: exact report, manifest paths, bundle.
 * @param {IndexedArtifact[]} files
 * @param {Record<string, any> | null} app
 * @param {string | null} reportFile
 * @param {string[]} manifestPaths
 */
export function artifactsForJob(files, app, reportFile = null, manifestPaths = []) {
  const reportNumber = reportNumberForJob(app, reportFile);
  const padded = reportNumber ? reportNumber.padStart(3, "0") : null;
  const bundle = padded ? `output/${padded}-${slug(app?.company, "company")}-${slug(app?.role, "role")}/` : null;
  const reportPath = reportFile ? `reports/${path.basename(reportFile)}` : null;
  const manifest = new Set(manifestPaths.map((value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "")));
  const seen = new Set();
  return files.filter((file) => {
    const related = file.path === reportPath || manifest.has(file.path) || (bundle && file.path.startsWith(bundle));
    if (!related || seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}
