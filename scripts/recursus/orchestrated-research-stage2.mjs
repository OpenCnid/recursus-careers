#!/usr/bin/env node

import {
  STAGE2_FAULTS,
  exerciseStage2,
  formatStage2Error,
  inspectStage2,
  prepareStage2,
  recoverStage2,
} from "../../lib/recursus/orchestrated-research-stage2.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/orchestrated-research-stage2.mjs prepare --output-root <empty-external-root>",
    "  node scripts/recursus/orchestrated-research-stage2.mjs exercise --output-root <empty-external-root> --fault <registered-fault>",
    "  node scripts/recursus/orchestrated-research-stage2.mjs inspect --output-root <existing-external-root>",
    "  node scripts/recursus/orchestrated-research-stage2.mjs recover --output-root <existing-external-root>",
    "",
    `Registered provider-free faults: ${STAGE2_FAULTS.join(", ")}`,
    "No provider, credential, network, live-browser, Docker, WSL, real-RLM, model-code, retry, or external-mutation authority is accepted.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((argument) => /(?:https?:\/\/|provider|credential|api[-_]?key|network|browser|docker|wsl|real[-_]?rlm|model[-_]?code|external[-_]?mutation|live[-_]?|retry)/iu.test(argument))) {
    throw Object.assign(new Error("Prohibited authority-bearing argument"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "exercise", "inspect", "recover"]).has(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  let outputRoot;
  let fault;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--output-root" && outputRoot === undefined) outputRoot = rest[++index];
    else if (argument === "--fault" && fault === undefined) fault = rest[++index];
    else throw Object.assign(new Error(`Unknown or repeated argument: ${argument ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
  }
  if (!outputRoot) throw Object.assign(new Error(`--output-root is required\n${usage()}`), { code: "USAGE" });
  if (command === "exercise" && !fault) throw Object.assign(new Error(`exercise requires --fault\n${usage()}`), { code: "USAGE" });
  if (command !== "exercise" && fault !== undefined) throw Object.assign(new Error("--fault is valid only for exercise"), { code: "USAGE" });
  return { command, outputRoot, fault };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  let result;
  if (parsed.command === "prepare") result = await prepareStage2(parsed.outputRoot);
  else if (parsed.command === "exercise") result = await exerciseStage2(parsed.outputRoot, parsed.fault);
  else if (parsed.command === "inspect") result = await inspectStage2(parsed.outputRoot);
  else result = await recoverStage2(parsed.outputRoot);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatStage2Error(error))}\n`);
  process.exitCode = 1;
});
