#!/usr/bin/env node

import {
  formatRc7GateCBrokerError,
  inspectRc7GateCFinalApprovalFreeze,
  prepareRc7GateCFinalApprovalFreeze,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-final-freeze.mjs prepare --root <empty-disposable-root> --ledger-root <selected-empty-ledger-root> --results-root <selected-empty-results-root> --proof-ledger-root <completed-proof-ledger> --proof-results-root <completed-proof-results> --proof-rlm-root <completed-proof-rlm>",
    "  node scripts/recursus/rc7-rlm-gate-c-final-freeze.mjs inspect --root <completed-disposable-root> --ledger-root <same-selected-empty-ledger-root> --results-root <same-selected-empty-results-root> --proof-ledger-root <same-completed-proof-ledger> --proof-results-root <same-completed-proof-results> --proof-rlm-root <same-completed-proof-rlm>",
    "",
    "This provider-free command freezes the exact approval digest and numeric ceilings. It cannot activate Gate C, import the live capsule, inspect credentials, reach a provider, or execute RLM.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((arg) => /(?:https?:\/\/|credential|api[-_]?key|oauth|activate|execute[-_]?rlm|provider[-_]?call|live[-_]?run|external[-_]?mutation)/iu.test(arg))) {
    throw Object.assign(new Error("Credential, URL, activation, provider-call, RLM, live-run, and external-mutation arguments are prohibited"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "inspect"]).has(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  let root;
  let ledgerRoot;
  let resultsRoot;
  let proofLedgerRoot;
  let proofResultsRoot;
  let proofRlmRoot;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--root" && root === undefined) root = rest[++index];
    else if (rest[index] === "--ledger-root" && ledgerRoot === undefined) ledgerRoot = rest[++index];
    else if (rest[index] === "--results-root" && resultsRoot === undefined) resultsRoot = rest[++index];
    else if (rest[index] === "--proof-ledger-root" && proofLedgerRoot === undefined) proofLedgerRoot = rest[++index];
    else if (rest[index] === "--proof-results-root" && proofResultsRoot === undefined) proofResultsRoot = rest[++index];
    else if (rest[index] === "--proof-rlm-root" && proofRlmRoot === undefined) proofRlmRoot = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!root || !ledgerRoot || !resultsRoot || !proofLedgerRoot || !proofResultsRoot || !proofRlmRoot) throw Object.assign(new Error(`All matrix and successful-proof roots are required\n${usage()}`), { code: "USAGE" });
  return { command, root, ledger_root: ledgerRoot, results_root: resultsRoot, proof_ledger_root: proofLedgerRoot, proof_results_root: proofResultsRoot, proof_rlm_root: proofRlmRoot };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.command === "prepare"
    ? await prepareRc7GateCFinalApprovalFreeze(parsed.root, parsed.ledger_root, parsed.results_root, parsed.proof_ledger_root, parsed.proof_results_root, parsed.proof_rlm_root)
    : await inspectRc7GateCFinalApprovalFreeze(parsed.root, parsed.ledger_root, parsed.results_root, parsed.proof_ledger_root, parsed.proof_results_root, parsed.proof_rlm_root);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCBrokerError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
