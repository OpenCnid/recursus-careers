#!/usr/bin/env node

import {
  ORCHESTRATED_RESEARCH_FAULTS,
  exerciseOrchestratedResearch,
  formatOrchestratedResearchError,
  inspectOrchestratedResearch,
  prepareOrchestratedResearch,
  recoverOrchestratedResearch,
} from "../../lib/recursus/orchestrated-research.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/orchestrated-research.mjs prepare --output-root <empty-external-root>",
    "  node scripts/recursus/orchestrated-research.mjs exercise --output-root <empty-external-root> --fault <registered-fault>",
    "  node scripts/recursus/orchestrated-research.mjs inspect --output-root <existing-external-root>",
    "  node scripts/recursus/orchestrated-research.mjs recover --output-root <existing-external-root>",
    "",
    `Registered provider-free faults: ${ORCHESTRATED_RESEARCH_FAULTS.join(", ")}`,
    "No provider, credential, network, live-browser, Docker, WSL, RLM, model-code, or external-mutation authority is accepted.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.some((argument) => /(?:https?:\/\/|provider|credential|api[-_]?key|network|browser|docker|wsl|execute[-_]?rlm|model[-_]?code|external[-_]?mutation|live[-_]?)/iu.test(argument))) {
    throw Object.assign(new Error("Prohibited authority-bearing argument"), { code: "PROHIBITED_AUTHORITY_ARGUMENT" });
  }
  const [command, ...rest] = argv;
  if (!new Set(["prepare", "exercise", "inspect", "recover"]).has(command)) {
    throw Object.assign(new Error(usage()), { code: "USAGE" });
  }
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
  if (parsed.command === "prepare") result = await prepareOrchestratedResearch(parsed.outputRoot);
  else if (parsed.command === "exercise") result = await exerciseOrchestratedResearch(parsed.outputRoot, parsed.fault);
  else if (parsed.command === "inspect") result = await inspectOrchestratedResearch(parsed.outputRoot);
  else result = await recoverOrchestratedResearch(parsed.outputRoot);
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatOrchestratedResearchError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
