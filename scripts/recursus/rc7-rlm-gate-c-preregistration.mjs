#!/usr/bin/env node

import {
  formatRc7GateCPreregistrationError,
  inspectRc7GateCPreregistration,
  prepareRc7GateCPreregistration,
} from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-preregistration.mjs prepare --root <empty-disposable-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-preregistration.mjs inspect --root <completed-disposable-root>",
    "",
    "This provider-free command cannot execute RLM, reach a provider, inspect credentials, browse, use Docker/WSL, or mutate external state.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((arg) => /(?:https?:\/\/|provider|credential|api[-_]?key|oauth|execute[-_]?rlm|live[-_]?|docker|wsl|external[-_]?mutation)/iu.test(arg))) {
    throw Object.assign(new Error("Provider, credential, URL, RLM, Docker, WSL, live, and external-mutation arguments are prohibited"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "inspect"]).has(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  let root;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--root" && root === undefined) root = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!root) throw Object.assign(new Error(`--root is required\n${usage()}`), { code: "USAGE" });
  return { command, root };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.command === "prepare"
    ? await prepareRc7GateCPreregistration(parsed.root)
    : await inspectRc7GateCPreregistration(parsed.root);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCPreregistrationError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
