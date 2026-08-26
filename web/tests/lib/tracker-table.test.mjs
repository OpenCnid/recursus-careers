import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseApplications } from "../../src/lib/tracker-table.mjs";

test("canonical Via tracker parses without tracker-aliases.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-tracker-table-"));
  const markdown = [
    "| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |",
    "|---|---|---|---|---|---|---|---|---|---|",
    "| 1 | 2026-06-20 | Acme | — | Senior Platform Engineer | 4.2/5 | Applied | ✅ | [1](report.md) | Strong fit |",
  ].join("\n");

  try {
    assert.deepEqual(parseApplications(markdown, root), [
      {
        n: "1",
        date: "2026-06-20",
        company: "Acme",
        via: "—",
        role: "Senior Platform Engineer",
        score: "4.2/5",
        status: "Applied",
        pdf: "✅",
        report: "[1](report.md)",
        notes: "Strong fit",
      },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
