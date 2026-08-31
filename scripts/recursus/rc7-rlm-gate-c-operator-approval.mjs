#!/usr/bin/env node

import {
  formatRc7GateCBrokerError,
  recordRc7GateCOperatorApproval,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-operator-approval.mjs record --root <empty-ledger-root> --results-root <selected-empty-results-root> --proof-ledger-root <completed-proof-ledger> --proof-results-root <completed-proof-results> --proof-rlm-root <completed-proof-rlm> --final-freeze-sha256 <64-hex> --future-activation-sha256 <64-hex> --approval-text <exact-frozen-text>",
    "",
    "Run only under explicit exact approval or the documented standing bounded delegation, after independent audits pass. This records governance evidence but does not itself call a provider, inspect credentials, or execute RLM.",
  ].join("\n");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "record") throw Object.assign(new Error(usage()), { code: "USAGE" });
  const parsed = { command, root: null, results_root: null, proof_ledger_root: null, proof_results_root: null, proof_rlm_root: null, final_freeze_sha256: null, future_activation_sha256: null, exact_approval_text: null };
  const names = new Map([
    ["--root", "root"], ["--results-root", "results_root"], ["--final-freeze-sha256", "final_freeze_sha256"],
    ["--proof-ledger-root", "proof_ledger_root"], ["--proof-results-root", "proof_results_root"], ["--proof-rlm-root", "proof_rlm_root"],
    ["--future-activation-sha256", "future_activation_sha256"], ["--approval-text", "exact_approval_text"],
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const field = names.get(rest[index]);
    if (!field || parsed[field] !== null) throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
    parsed[field] = rest[++index] ?? null;
  }
  if (!parsed.root || !parsed.results_root || !parsed.proof_ledger_root || !parsed.proof_results_root || !parsed.proof_rlm_root
    || !/^[0-9a-f]{64}$/u.test(parsed.final_freeze_sha256 ?? "") || !/^[0-9a-f]{64}$/u.test(parsed.future_activation_sha256 ?? "")
    || !parsed.exact_approval_text) throw Object.assign(new Error(usage()), { code: "USAGE" });
  return parsed;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = await recordRc7GateCOperatorApproval(parsed.root, {
    exact_approval_text: parsed.exact_approval_text,
    final_freeze_sha256: parsed.final_freeze_sha256,
    future_activation_sha256: parsed.future_activation_sha256,
    results_root: parsed.results_root,
    proof_ledger_root: parsed.proof_ledger_root,
    proof_results_root: parsed.proof_results_root,
    proof_rlm_root: parsed.proof_rlm_root,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCBrokerError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
