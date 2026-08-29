#!/usr/bin/env node

import {
  inspectRc7GateCWorkerStage,
  prepareRc7GateCWorkerStage,
} from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-worker.mjs prepare --runtime-root <exact-disposable-runtime-root> --stage-root <empty-direct-child>",
    "  node scripts/recursus/rc7-rlm-gate-c-worker.mjs inspect --runtime-root <exact-disposable-runtime-root> --stage-root <completed-direct-child>",
    "",
    "This provider-free command verifies the pinned runtime and stages inert worker bytes. It never imports the live capsule, resolves credentials, reaches a provider, or executes RLM.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((arg) => /(?:https?:\/\/|api[-_]?key|oauth|credential|secret|token|activate|execute[-_]?rlm|provider[-_]?call|live[-_]?run|external[-_]?mutation)/iu.test(arg))) {
    throw Object.assign(new Error("URLs, credential-like paths, activation, provider calls, RLM execution, and external mutation are prohibited"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "inspect"]).has(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  let runtimeRoot;
  let stageRoot;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--runtime-root" && runtimeRoot === undefined) runtimeRoot = rest[++index];
    else if (rest[index] === "--stage-root" && stageRoot === undefined) stageRoot = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!runtimeRoot || !stageRoot) throw Object.assign(new Error(`--runtime-root and --stage-root are required\n${usage()}`), { code: "USAGE" });
  return { command, runtime_root: runtimeRoot, stage_root: stageRoot };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const input = { runtime_root: parsed.runtime_root, stage_root: parsed.stage_root };
  const result = parsed.command === "prepare" ? await prepareRc7GateCWorkerStage(input) : await inspectRc7GateCWorkerStage(input);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error?.code ?? "UNEXPECTED_ERROR", message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
