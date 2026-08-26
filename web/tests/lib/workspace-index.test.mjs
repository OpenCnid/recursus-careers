import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readContacts,
  readDocumentLibrary,
  readInterviewWorkspace,
  readSearchWorkspace,
} from "../../src/lib/workspace-index.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recursus-web-index-"));
  for (const dir of ["data", "documents/cv", "output", "reports", "interview-prep/sessions", "writing-samples", "jds"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  return root;
}

test("search workspace reflects portals.yml without a second search store", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "portals.yml"), `
title_filter:
  positive: [Platform Engineer, SRE]
  negative: [Intern]
location_filter:
  allow: [Remote]
search_queries:
  - name: Fresh platform roles
    query: 'site:jobs.example "Platform Engineer"'
    enabled: true
tracked_companies:
  - name: Acme
    provider: greenhouse
    careers_url: https://example.test/acme
    enabled: true
`);
    fs.writeFileSync(path.join(root, "data", "scan-history.tsv"), "https://example.test/1\t2026-08-20\tRole\n");
    const result = readSearchWorkspace(root);
    assert.deepEqual(result.include, ["Platform Engineer", "SRE"]);
    assert.deepEqual(result.exclude, ["Intern"]);
    assert.equal(result.queries[0].name, "Fresh platform roles");
    assert.equal(result.companies[0].provider, "greenhouse");
    assert.equal(result.lastScanDate, "2026-08-20");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("contacts parser preserves notes and skips an optional header", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "data", "contacts.tsv"), [
      "name\tcompany\ttype\ttitle\tphone\temail\tlinkedin\ttracker\tnotes",
      "Ada Lovelace\tAcme\thiring-manager\tVP Platform\t-\tada@example.test\thttps://linkedin.com/in/ada\t7\tMet at event\tStrong fit",
    ].join("\n"));
    const result = readContacts(root);
    assert.equal(result.length, 1);
    assert.equal(result[0].tracker, "7");
    assert.equal(result[0].notes, "Met at event\tStrong fit");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("interview and document indexes classify canonical artifacts", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "cv.md"), "# CV\n");
    fs.writeFileSync(path.join(root, "documents", "README.md"), "system scaffold\n");
    fs.writeFileSync(path.join(root, "documents", "cv", "master.pdf"), "pdf");
    fs.writeFileSync(path.join(root, "reports", "001-acme.md"), "# Report\n");
    fs.writeFileSync(path.join(root, "interview-prep", "story-bank.md"), "# Stories\n\n## One\n\n## Two\n");
    fs.writeFileSync(path.join(root, "interview-prep", "acme-platform.md"), "# Acme\n\n## Process\n");
    fs.writeFileSync(path.join(root, "interview-prep", "sessions", "acme-platform-behavioral.md"), `---
company: Acme
role: Platform Engineer
round: behavioral
date: 2026-08-21
source: practice
---
## Q1
**Interviewer:** Tell me about a time.
**Candidate:** Answer.
`);

    const interview = readInterviewWorkspace(root);
    assert.equal(interview.sessions.length, 1);
    assert.equal(interview.sessions[0].questions, 1);
    assert.equal(interview.artifacts.find((item) => item.kind === "Story bank").entries, 2);

    const library = readDocumentLibrary(root);
    assert.ok(library.some((item) => item.path === "cv.md" && item.group === "Profile sources"));
    assert.ok(library.some((item) => item.path === "documents/cv/master.pdf"));
    assert.ok(library.some((item) => item.path === "reports/001-acme.md"));
    assert.ok(!library.some((item) => item.path === "documents/README.md"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
