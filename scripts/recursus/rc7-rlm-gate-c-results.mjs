#!/usr/bin/env node

import {
  formatRc7GateCBrokerError,
  recoverRc7GateCDispatchLedger,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import {
  inspectRc7GateCResults,
  initializeRc7GateCResults,
  publishRc7GateCAggregate,
  recoverRc7GateCResults,
} from "../../lib/recursus/rc7-rlm-gate-c-results.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-results.mjs prepare --root <empty-external-root> --ledger-root <approved-ledger-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-results.mjs inspect --root <results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-results.mjs recover --root <results-root> --ledger-root <approved-ledger-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-results.mjs aggregate --root <results-root> --ledger-root <approved-ledger-root>",
    "",
    "These commands are provider-free. They cannot create approval, execute RLM, call a provider, inspect credentials, or replace an attempt.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((arg) => /(?:https?:\/\/|credential|api[-_]?key|oauth|approval[-_]?text|provider[-_]?call|execute[-_]?rlm|external[-_]?mutation)/iu.test(arg))) {
    throw Object.assign(new Error("Credential, URL, approval-text, provider-call, RLM, and external-mutation arguments are prohibited"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!["prepare", "inspect", "recover", "aggregate"].includes(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  const parsed = { command, root: null, ledger_root: null };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (key === "--root" && parsed.root === null) parsed.root = rest[++index] ?? null;
    else if (key === "--ledger-root" && parsed.ledger_root === null) parsed.ledger_root = rest[++index] ?? null;
    else throw Object.assign(new Error(`Unknown or repeated argument: ${key ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!parsed.root || (["prepare", "recover", "aggregate"].includes(command) && !parsed.ledger_root) || (command === "inspect" && parsed.ledger_root !== null)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  return parsed;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  let result;
  if (parsed.command === "prepare") result = await initializeRc7GateCResults(parsed.root, parsed.ledger_root);
  else if (parsed.command === "inspect") result = await inspectRc7GateCResults(parsed.root);
  else if (parsed.command === "aggregate") result = await publishRc7GateCAggregate(parsed.root, parsed.ledger_root);
  else {
    const ledger = await recoverRc7GateCDispatchLedger(parsed.ledger_root);
    const results = await recoverRc7GateCResults(parsed.root, parsed.ledger_root);
    result = { results, ledger };
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCBrokerError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
