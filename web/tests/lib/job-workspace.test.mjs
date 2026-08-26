import test from "node:test";
import assert from "node:assert/strict";
import {
  artifactsForJob,
  contactsForJob,
  interviewForJob,
  parsePdfManifest,
  reportNumberForJob,
} from "../../src/lib/job-workspace.mjs";

const app = {
  n: "309",
  company: "Acme, Inc.",
  role: "Senior Platform Engineer",
  report: "[8](../reports/008-acme-2026-08-20.md)",
};

test("report identity comes from the report link, never the tracker row number", () => {
  assert.equal(reportNumberForJob(app, "309-wrong.md"), "8");
  assert.equal(reportNumberForJob({ ...app, report: "—" }, "008-acme-2026-08-20.md"), "8");
});

test("contact matching prefers tracker identity and only borrows unlinked company contacts", () => {
  const contacts = [
    { name: "Explicit", company: "Different Co", tracker: "309" },
    { name: "Unlinked", company: "ACME INC", tracker: "-" },
    { name: "Other role", company: "Acme, Inc.", tracker: "310" },
    { name: "Other company", company: "Globex", tracker: "-" },
  ];
  assert.deepEqual(contactsForJob(contacts, app).map((item) => item.name), ["Explicit", "Unlinked"]);
});

test("interview matching keeps shared banks and selects only this company role", () => {
  const workspace = {
    artifacts: [
      { name: "story-bank.md", path: "interview-prep/story-bank.md", kind: "Story bank" },
      { name: "acme-senior-platform-engineer.md", path: "interview-prep/acme-senior-platform-engineer.md", kind: "Prep pack" },
      { name: "acme-product-manager.md", path: "interview-prep/acme-product-manager.md", kind: "Prep pack" },
      { name: "globex-platform.md", path: "interview-prep/globex-platform.md", kind: "Prep pack" },
    ],
    sessions: [
      { company: "Acme Inc", path: "interview-prep/sessions/acme-platform.md" },
      { company: "Globex", path: "interview-prep/sessions/globex-platform.md" },
    ],
  };
  const result = interviewForJob(workspace, app);
  assert.equal(result.shared.length, 1);
  assert.deepEqual(result.roleArtifacts.map((item) => item.name), ["acme-senior-platform-engineer.md"]);
  assert.equal(result.sessions.length, 1);
});

test("PDF manifest and document matching follow report identity and exact bundle", () => {
  const manifest = parsePdfManifest([
    "8\toutput/008-acme-senior-platform-engineer/cv/tailored/v001/cv.pdf\toutput/008-acme-senior-platform-engineer/cv/tailored/v001/cv.html\ta4\t2026-08-20",
    "9\toutput/009-acme-product-manager/cv.pdf\t\tletter\t2026-08-21",
  ].join("\n"), "008");
  assert.equal(manifest.length, 2);

  const files = [
    { path: "reports/008-acme-2026-08-20.md" },
    { path: "output/008-acme-inc-senior-platform-engineer/cv/tailored/v001/cv.pdf" },
    { path: "output/008-acme-inc-senior-platform-engineer/decision/reuse.json" },
    { path: "output/009-acme-inc-product-manager/cv.pdf" },
    { path: "reports/009-acme-2026-08-21.md" },
  ];
  const result = artifactsForJob(files, app, "008-acme-2026-08-20.md", manifest);
  assert.deepEqual(result.map((item) => item.path), [
    "reports/008-acme-2026-08-20.md",
    "output/008-acme-inc-senior-platform-engineer/cv/tailored/v001/cv.pdf",
    "output/008-acme-inc-senior-platform-engineer/decision/reuse.json",
  ]);
});

test("manifest paths containing traversal are ignored", () => {
  assert.deepEqual(parsePdfManifest("8\t../config/profile.yml\t/output/bad.html\tletter\t2026-08-20", "8"), []);
});
