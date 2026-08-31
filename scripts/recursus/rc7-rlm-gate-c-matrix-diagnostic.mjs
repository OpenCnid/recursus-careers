#!/usr/bin/env node

import path from "node:path";

import { preflightRc7GateCCredentialHomeEnvironment } from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";
import {
  formatRc7GateCMatrixDiagnosticError,
  inspectRc7GateCMatrixDiagnostic,
  prepareRc7GateCMatrixDiagnosticFreeze,
  recordRc7GateCMatrixDiagnosticApproval,
  runRc7GateCMatrixDiagnostic,
} from "../../lib/recursus/rc7-rlm-gate-c-matrix-diagnostic.mjs";

const HASH = /^[0-9a-f]{64}$/u;
const FIELDS = Object.freeze({
  prepare: ["freeze_root", "diagnostic_root"],
  approve: ["diagnostic_root", "closure_sha256", "freeze_sha256", "approval_text"],
  run: ["diagnostic_root", "stage_root"],
  inspect: ["diagnostic_root"],
});
const FLAGS = new Map([
  ["--freeze-root", "freeze_root"], ["--diagnostic-root", "diagnostic_root"], ["--stage-root", "stage_root"],
  ["--closure-sha256", "closure_sha256"], ["--freeze-sha256", "freeze_sha256"], ["--approval-text", "approval_text"],
]);

function usage() {
  return "Usage: prepare --freeze-root <empty> --diagnostic-root <empty> | approve --diagnostic-root <empty> --closure-sha256 <hex> --freeze-sha256 <hex> --approval-text <exact> | run --diagnostic-root <approved> --stage-root <current-stage> | inspect --diagnostic-root <root>";
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const required = FIELDS[command];
  if (!required) throw Object.assign(new Error(usage()), { code: "USAGE" });
  const value = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const field = FLAGS.get(rest[index]);
    const item = rest[index + 1];
    if (!field || !required.includes(field) || Object.hasOwn(value, field) || item === undefined) throw Object.assign(new Error(usage()), { code: "USAGE" });
    value[field] = item;
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  for (const field of required.filter((item) => item.endsWith("_root"))) {
    if (!path.isAbsolute(value[field])) throw Object.assign(new Error(`${field} must be absolute`), { code: "USAGE" });
    value[field] = path.resolve(value[field]);
  }
  for (const field of ["closure_sha256", "freeze_sha256"].filter((item) => required.includes(item))) if (!HASH.test(value[field])) throw Object.assign(new Error(usage()), { code: "USAGE" });
  return value;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  let result;
  if (input.command === "prepare") result = await prepareRc7GateCMatrixDiagnosticFreeze(input.freeze_root, input.diagnostic_root);
  else if (input.command === "approve") result = await recordRc7GateCMatrixDiagnosticApproval(input.diagnostic_root, {
    closure_sha256: input.closure_sha256,
    freeze_sha256: input.freeze_sha256,
    exact_approval_text: input.approval_text,
  });
  else if (input.command === "run") {
    preflightRc7GateCCredentialHomeEnvironment();
    result = await runRc7GateCMatrixDiagnostic(input.diagnostic_root, input.stage_root);
  } else result = await inspectRc7GateCMatrixDiagnostic(input.diagnostic_root);
  process.stdout.write(`${JSON.stringify({ ok: true, command: input.command, ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatRc7GateCMatrixDiagnosticError(error))}\n`);
  process.exitCode = 1;
});
