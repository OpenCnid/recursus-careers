#!/usr/bin/env node

import {
  formatRc7GateCBrokerError,
  inspectRc7GateCFinalApprovalFreeze,
  prepareRc7GateCFinalApprovalFreeze,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-final-freeze.mjs prepare --root <empty-disposable-root> --ledger-root <selected-empty-ledger-root> --results-root <selected-empty-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-final-freeze.mjs inspect --root <completed-disposable-root> --ledger-root <same-selected-empty-ledger-root> --results-root <same-selected-empty-results-root>",
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
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--root" && root === undefined) root = rest[++index];
    else if (rest[index] === "--ledger-root" && ledgerRoot === undefined) ledgerRoot = rest[++index];
    else if (rest[index] === "--results-root" && resultsRoot === undefined) resultsRoot = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!root || !ledgerRoot || !resultsRoot) throw Object.assign(new Error(`--root, --ledger-root, and --results-root are required\n${usage()}`), { code: "USAGE" });
  return { command, root, ledger_root: ledgerRoot, results_root: resultsRoot };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.command === "prepare"
    ? await prepareRc7GateCFinalApprovalFreeze(parsed.root, parsed.ledger_root, parsed.results_root)
    : await inspectRc7GateCFinalApprovalFreeze(parsed.root, parsed.ledger_root, parsed.results_root);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCBrokerError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
