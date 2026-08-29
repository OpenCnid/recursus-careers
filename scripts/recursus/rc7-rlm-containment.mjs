#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import {
  formatRc7ContainmentError,
  inspectRc7Containment,
  prepareRc7Containment,
  recoverRc7Containment,
} from "../../lib/recursus/rc7-rlm-containment.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-containment.mjs run --root <empty-external-root> --docker-config <empty-controlled-config-root> --docker-exe <absolute-docker.exe> --image <sha256:...>",
    "  node scripts/recursus/rc7-rlm-containment.mjs inspect --root <external-root>",
    "  node scripts/recursus/rc7-rlm-containment.mjs recover --root <external-root> [--docker-config <empty-controlled-config-root> --docker-exe <absolute-docker.exe>]",
    "  node scripts/recursus/rc7-rlm-containment.mjs compare --first <package.json> --second <package.json>",
    "",
    "The run command is provider-free and credential-free. It accepts no URL, provider, credential, or external-mutation option.",
  ].join("\n");
}

function parseArgs(args) {
  const command = args.shift();
  if (!new Set(["run", "inspect", "recover", "compare"]).has(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  const values = {};
  while (args.length) {
    const flag = args.shift();
    if (!flag?.startsWith("--") || args.length === 0) throw Object.assign(new Error(`Malformed argument: ${flag ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
    const key = flag.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(values, key)) throw Object.assign(new Error(`Repeated argument: ${flag}\n${usage()}`), { code: "USAGE" });
    values[key] = args.shift();
  }
  const allowed = command === "run"
    ? ["root", "docker_config", "docker_exe", "image"]
    : command === "compare" ? ["first", "second"] : command === "recover" ? ["root", "docker_config", "docker_exe"] : ["root"];
  const required = command === "run" ? allowed : command === "compare" ? allowed : ["root"];
  const recoveryPairMismatched = command === "recover" && Boolean(values.docker_config) !== Boolean(values.docker_exe);
  if (Object.keys(values).some((key) => !allowed.includes(key)) || required.some((key) => !values[key]) || recoveryPairMismatched) throw Object.assign(new Error(`Arguments do not match the closed ${command} interface.\n${usage()}`), { code: "USAGE" });
  return { command, values };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "run") {
    result = await prepareRc7Containment(values.root, {
      dockerConfig: values.docker_config,
      dockerExecutable: values.docker_exe,
      imageId: values.image,
    });
  } else if (command === "inspect") result = await inspectRc7Containment(values.root);
  else if (command === "recover") result = await recoverRc7Containment(values.root, values.docker_config ? { dockerConfig: values.docker_config, dockerExecutable: values.docker_exe } : {});
  else {
    const first = await readFile(values.first);
    const second = await readFile(values.second);
    result = { byte_identical: first.equals(second), first_bytes: first.byteLength, second_bytes: second.byteLength };
    if (!result.byte_identical) throw Object.assign(new Error("Gate B packages are not byte-identical"), { code: "NONDETERMINISTIC_PREPARATION" });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7ContainmentError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
