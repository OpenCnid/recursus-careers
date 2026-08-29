#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  Rc7GateCHostLauncherError,
  launchRc7GateCLiveCapsuleFromHost,
  rc7GateCHostLauncherContract,
} from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-host-launcher.mjs contract",
    "  node scripts/recursus/rc7-rlm-gate-c-host-launcher.mjs launch --request-file <canonical-local-json>",
    "",
    "The launch command performs current host preflight, passes one broker-derived handoff over anonymous inherited pipes, requires a nonce-bound capsule acknowledgment, and starts one one-shot capsule only after the acknowledgment is validated.",
    "It accepts no expected closure, credential reference, provider URL, model, prompt, Docker verifier, or process-controller override.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv[0] === "contract" && argv.length === 1) return { command: "contract" };
  if (argv[0] !== "launch" || argv.length !== 3 || argv[1] !== "--request-file") throw Object.assign(new Error(usage()), { code: "USAGE" });
  const requestFile = argv[2];
  if (!requestFile || !path.isAbsolute(requestFile) || /(?:credential|secret|api[-_]?key|oauth|token)/iu.test(requestFile)) throw Object.assign(new Error("Request file must be one explicit non-credential-like absolute local path"), { code: "UNSAFE_REQUEST_FILE" });
  return { command: "launch", request_file: path.resolve(requestFile) };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "contract") {
    process.stdout.write(`${JSON.stringify({ ok: true, contract: rc7GateCHostLauncherContract() })}\n`);
    return;
  }
  const bytes = await readFile(parsed.request_file);
  if (bytes.byteLength > 1_048_576 || bytes.includes(0)) throw Object.assign(new Error("Launch request is oversized or contains NUL"), { code: "MALFORMED_LAUNCH_REQUEST" });
  let input;
  try { input = JSON.parse(bytes.toString("utf8")); } catch { throw Object.assign(new Error("Launch request is not JSON"), { code: "MALFORMED_LAUNCH_REQUEST" }); }
  const result = await launchRc7GateCLiveCapsuleFromHost(input);
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
}

main().catch((error) => {
  const code = error instanceof Rc7GateCHostLauncherError ? error.code : error?.code ?? "UNEXPECTED_ERROR";
  process.stderr.write(`${JSON.stringify({ ok: false, code, message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
