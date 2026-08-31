#!/usr/bin/env node

import {
  RC7_INTERRUPTION_POINTS,
  formatRc7QualificationError,
  inspectRc7Qualification,
  prepareRc7Qualification,
  recoverRc7Qualification,
} from "../../lib/recursus/rc7-rlm-qualification.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-qualification.mjs prepare --root <empty-disposable-root> [--interrupt-at <registered-point>]",
    "  node scripts/recursus/rc7-rlm-qualification.mjs inspect --root <disposable-root>",
    "  node scripts/recursus/rc7-rlm-qualification.mjs recover --root <disposable-root>",
    "",
    `Registered provider-free interruption points: ${RC7_INTERRUPTION_POINTS.join(", ")}`,
    "This command accepts no provider, credential, URL, network, RLM-execution, or external-mutation authority.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((arg) => /(?:https?:\/\/|provider|credential|api[-_]?key|external[-_]?mutation|execute[-_]?rlm|live[-_]?)/iu.test(arg))) {
    throw Object.assign(new Error("Provider, credential, URL, RLM-execution, live, and external-mutation arguments are prohibited"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "inspect", "recover"]).has(command)) {
    throw Object.assign(new Error(usage()), { code: "USAGE" });
  }
  let root;
  let interruptAt;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--root" && root === undefined) root = rest[++index];
    else if (arg === "--interrupt-at" && interruptAt === undefined) interruptAt = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${arg ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!root) throw Object.assign(new Error(`--root is required\n${usage()}`), { code: "USAGE" });
  if (command !== "prepare" && interruptAt !== undefined) throw Object.assign(new Error("--interrupt-at is valid only for prepare"), { code: "USAGE" });
  return { command, root, interruptAt };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  let result;
  if (parsed.command === "prepare") result = await prepareRc7Qualification(parsed.root, { interruptAt: parsed.interruptAt });
  else if (parsed.command === "inspect") result = await inspectRc7Qualification(parsed.root);
  else result = await recoverRc7Qualification(parsed.root);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7QualificationError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
