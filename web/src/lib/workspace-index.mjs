import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function readYaml(file) {
  try {
    return record(yaml.load(fs.readFileSync(file, "utf8")));
  } catch {
    return {};
  }
}

function newestScanDate(root) {
  try {
    const text = fs.readFileSync(path.join(root, "data", "scan-history.tsv"), "utf8");
    const dates = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    return dates.sort().at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the scanner's durable search contract. This is intentionally a view of
 * portals.yml, not a second saved-search database: CLI scans and the web always
 * resolve the same filters, broad queries, and tracked companies.
 *
 * @param {string} root
 */
export function readSearchWorkspace(root) {
  const file = path.join(root, "portals.yml");
  const doc = readYaml(file);
  const title = record(doc.title_filter);
  const location = record(doc.location_filter);
  const rawQueries = Array.isArray(doc.search_queries) ? doc.search_queries : [];
  const rawCompanies = Array.isArray(doc.tracked_companies)
    ? doc.tracked_companies
    : Array.isArray(doc.companies)
      ? doc.companies
      : [];

  const queries = rawQueries
    .map((value, index) => {
      const item = record(value);
      const query = String(item.query ?? "").trim();
      const name = String(item.name ?? `Search ${index + 1}`).trim();
      if (!query) return null;
      return { name, query, enabled: item.enabled !== false };
    })
    .filter(Boolean);

  const companies = rawCompanies
    .map((value) => {
      const item = record(value);
      const name = String(item.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        provider: String(item.provider ?? item.ats ?? item.scan_method ?? "auto").trim(),
        target: String(item.careers_url ?? item.api ?? item.slug ?? "").trim(),
        enabled: item.enabled !== false,
      };
    })
    .filter(Boolean);

  return {
    configured: fs.existsSync(file),
    include: list(title.positive),
    exclude: list(title.negative),
    locations: list(location.allow),
    blockedLocations: list(location.block),
    alwaysAllow: list(location.always_allow),
    blockHard: list(location.block_hard),
    queries,
    companies,
    lastScanDate: newestScanDate(root),
  };
}

/**
 * Parse the append/update-friendly contact ledger created by contacto mode.
 * Notes are allowed to contain tabs, so all cells after the eighth are joined.
 *
 * @param {string} root
 */
export function readContacts(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, "data", "contacts.tsv"), "utf8");
  } catch {
    return [];
  }

  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const cells = line.split("\t");
    const [name = "", company = "", type = "", title = "", phone = "", email = "", linkedin = "", tracker = "-"] = cells;
    if (!name.trim() || (name.trim().toLowerCase() === "name" && company.trim().toLowerCase() === "company")) continue;
    rows.push({
      name: name.trim(),
      company: company.trim(),
      type: type.trim(),
      title: title.trim(),
      phone: phone.trim(),
      email: email.trim(),
      linkedin: linkedin.trim(),
      tracker: tracker.trim(),
      notes: cells.slice(8).join("\t").trim(),
    });
  }
  return rows;
}

function safeFiles(root, relativeRoot) {
  const start = path.join(root, relativeRoot);
  const files = [];
  const visit = (absolute, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".gitkeep") continue;
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = path.join(relative, entry.name);
      // Never traverse user-created links while building a browser-visible
      // inventory. The intake CLI may deliberately follow them; the dashboard
      // only needs to report artifacts that are physically inside the root.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(childAbsolute, childRelative);
      else if (entry.isFile()) {
        try {
          const stat = fs.statSync(childAbsolute);
          files.push({
            name: entry.name,
            path: childRelative.split(path.sep).join("/"),
            extension: path.extname(entry.name).slice(1).toLowerCase() || "file",
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            absolute: childAbsolute,
          });
        } catch {
          // A file can disappear between readdir and stat; omit it this render.
        }
      }
    }
  };
  visit(start, relativeRoot);
  return files;
}

function frontMatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  try {
    return record(yaml.load(text.slice(3, end)));
  } catch {
    return {};
  }
}

/** @param {string} root */
export function readInterviewWorkspace(root) {
  const indexed = safeFiles(root, "interview-prep").filter(
    (file) => file.path !== "interview-prep/sessions/README.md",
  );
  const artifacts = [];
  const sessions = [];

  for (const file of indexed) {
    let text = "";
    if (file.extension === "md") {
      try {
        text = fs.readFileSync(file.absolute, "utf8");
      } catch {
        text = "";
      }
    }
    if (file.path.startsWith("interview-prep/sessions/")) {
      const meta = frontMatter(text);
      sessions.push({
        ...file,
        company: String(meta.company ?? "Practice").trim(),
        role: String(meta.role ?? "General practice").trim(),
        round: String(meta.round ?? "session").trim(),
        date: String(meta.date ?? file.updatedAt.slice(0, 10)).trim(),
        source: String(meta.source ?? "manual").trim(),
        questions: (text.match(/^##\s+Q\d+/gm) ?? []).length,
      });
      continue;
    }

    let kind = "Prep pack";
    if (file.name === "story-bank.md") kind = "Story bank";
    else if (file.name === "question-bank.md") kind = "Question bank";
    else if (file.name === "retracted-claims.md") kind = "Claim guardrail";
    else if (file.name.endsWith("-redflags.md")) kind = "Red-flag review";
    else if (file.name.includes("guide")) kind = "Guide";
    artifacts.push({
      ...file,
      kind,
      entries: (text.match(/^##\s+/gm) ?? []).length,
    });
  }

  const newest = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
  artifacts.sort(newest);
  sessions.sort((a, b) => b.date.localeCompare(a.date) || newest(a, b));
  return { artifacts, sessions };
}

function rootFile(root, relative, group) {
  const absolute = path.join(root, relative);
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return null;
    return {
      name: path.basename(relative),
      path: relative.split(path.sep).join("/"),
      extension: path.extname(relative).slice(1).toLowerCase() || "file",
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      group,
    };
  } catch {
    return null;
  }
}

/**
 * Build one read-only index across canonical source and generated-artifact
 * folders. Only metadata is exposed; file contents stay local and unopened.
 *
 * @param {string} root
 */
export function readDocumentLibrary(root) {
  const files = [];
  for (const [relative, group] of [
    ["cv.md", "Profile sources"],
    ["article-digest.md", "Profile sources"],
    ["voice-dna.md", "Profile sources"],
  ]) {
    const file = rootFile(root, relative, group);
    if (file) files.push(file);
  }

  const folders = [
    ["documents", "Source documents"],
    ["output", "Application documents"],
    ["reports", "Evaluation reports"],
    ["interview-prep", "Interview preparation"],
    ["writing-samples", "Writing samples"],
    ["jds", "Job descriptions"],
  ];
  for (const [relative, group] of folders) {
    for (const file of safeFiles(root, relative)) {
      if (file.path === "documents/README.md" || file.path === "interview-prep/sessions/README.md") continue;
      const { absolute: _absolute, ...publicFile } = file;
      files.push({ ...publicFile, group });
    }
  }

  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files;
}
