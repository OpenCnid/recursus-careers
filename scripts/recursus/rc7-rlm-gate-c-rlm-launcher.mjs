#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildRc7GateCRlmCreateArguments,
  buildRc7GateCRlmImageDefinition,
  formatRc7GateCRlmLauncherError,
  inspectRc7GateCRlmLauncher,
  prepareRc7GateCRlmLauncher,
  publishRc7GateCRlmProgram,
} from "../../lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs";
import { canonicalJsonV1 } from "../../lib/recursus/prompt-context-v1.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs image-definition",
    "  node scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs prepare --root <empty-external-root> --input <json>",
    "  node scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs publish-program --root <prepared-root> --input <json>",
    "  node scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs inspect --root <prepared-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs create-plan --root <prepared-root>",
    "",
    "This CLI is provider-free and does not execute Docker, RLM, credentials, a provider, or network requests.",
  ].join("\n");
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing ${name}`);
  return path.resolve(process.argv[index + 1]);
}

async function jsonFile(name) {
  const file = option(name);
  const bytes = await readFile(file);
  if (bytes.byteLength > 262_144) throw new Error(`${name} JSON is oversized`);
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  const command = process.argv[2];
  if (!command || ["-h", "--help", "help"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  let result;
  if (command === "image-definition") result = await buildRc7GateCRlmImageDefinition();
  else if (command === "prepare") result = await prepareRc7GateCRlmLauncher(option("--root"), await jsonFile("--input"));
  else if (command === "publish-program") result = await publishRc7GateCRlmProgram(option("--root"), await jsonFile("--input"));
  else if (command === "inspect") result = await inspectRc7GateCRlmLauncher(option("--root"));
  else if (command === "create-plan") {
    const context = await inspectRc7GateCRlmLauncher(option("--root"));
    result = buildRc7GateCRlmCreateArguments(context);
  } else throw new Error(`Unknown command ${JSON.stringify(command)}`);
  process.stdout.write(`${canonicalJsonV1(result)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${canonicalJsonV1(formatRc7GateCRlmLauncherError(error))}\n`);
  process.exitCode = 1;
}
