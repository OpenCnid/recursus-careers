import { lstat, mkdir, open, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRc7GateCBrokerConformancePackage,
  buildRc7GateCRequestIntent,
  inspectRc7GateCTreatmentProofContainer,
} from "./rc7-rlm-gate-c-broker.mjs";
import { buildRc7GateCPreregistrationPackage } from "./rc7-rlm-gate-c-preregistration.mjs";
import {
  inspectRc7GateCRlmCompletedArtifact,
  inspectRc7GateCRlmLauncher,
  serviceRc7GateCRlmChildProposal,
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_LIMITS,
} from "./rc7-rlm-gate-c-rlm-launcher.mjs";
import { buildRc7GateCRlmChildSpecs } from "./rc7-rlm-gate-c-treatment-spec.mjs";
import {
  RC7_GATE_C_INTEGRATION_FAILURE_PHASES,
  RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES,
  RC7_GATE_C_STREAM_FAILURE_PHASES,
  buildRc7GateCSealedResult,
  classifyRc7GateCIntegrationFailurePhase,
  validateRc7GateCSealedWorkerRequest,
} from "./rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_TREATMENT_PROOF_POLICY_ID = "rc7-gate-c-lab01-complete-rlm-treatment-proof-v15";
export const RC7_GATE_C_TREATMENT_PROOF_RUN_ID = "382b4ea0b261e55eb7322857a1c7b8651e071c7c2c6ac3f6fe961bfd2db782fb";
export const RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME = "gate-c-treatment-proof-freeze.json";
export const RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME = "treatment-proof-result.json";
export const RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME = "provider-free-rlm-conformance.json";
export const RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS = 15_000;
export const RC7_GATE_C_TREATMENT_PROOF_REPLACEABLE_FAILURE_CODES = Object.freeze([
  "PROVIDER_TERMINAL_ERROR_RATE_LIMIT",
  "PROVIDER_TERMINAL_ERROR_TIMEOUT",
  "PROVIDER_TERMINAL_ERROR_UNAVAILABLE",
]);

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const HASH = /^[0-9a-f]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_-]{1,95}$/u;
const PROVIDER_TERMINAL_FAILURE_CODES = new Set(RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES);
const REPLACEABLE_FAILURE_CODES = new Set(RC7_GATE_C_TREATMENT_PROOF_REPLACEABLE_FAILURE_CODES);

export function isRc7GateCTreatmentProofReplaceableFailureCode(value) {
  return REPLACEABLE_FAILURE_CODES.has(value);
}
const APPROVAL_FILE = "operator-approval.json";
const META_FILE = "ledger-meta.json";
const ACTIVE_FILE = "active-dispatch.json";
const LOCK_FILE = ".treatment-proof.lock";
const RESERVATIONS_DIR = "reservations";
const TERMINALS_DIR = "terminals";
const HANDOFFS_DIR = "handoffs";
const DOCKER_CONFIG_DIR = "docker-cli-config";
const PROTECTED_SEGMENTS = new Set([
  ".aws", ".azure", ".codex", ".gnupg", ".ssh", "credential", "credentials", "data", "documents",
  "interview-prep", "keychain", "oauth", "output", "reports", "secret", "secrets", "token", "tokens", "writing-samples",
]);
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const SUPERSEDED_TREATMENT_PROOFS = deepFreeze([
  {
    closure_sha256: "18d37e7ed9f9b7b015af73c2e653effc90b1951f35560f521ce25d8c9285a17f",
    activation_sha256: "d90e191666e85864209ac72e0048a1e758326cd6426c2dc1bab717f4cc2bb6de",
    terminal_sha256: "85f508d5e6ba8c9479222e229790a63fb64badbe36566683bdf4814b971b3c18",
    state: "indeterminate-no-replay-local-host-stage-identity-mismatch-before-durable-handoff",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v1", device_id: "3329890834", file_id: "5066549583475827", birthtime_ns: "1787985336404481100", root_sha256: "90ef1e88626ef56189da8b8666afe6b1369070f867ebcca4af20ea915c1fbb46" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v1", device_id: "3329890834", file_id: "5910974513607796", birthtime_ns: "1787985336404481100", root_sha256: "781a3850cb06fc5d50eda429860961859337a2977103fd456faafcdbf0b43f9e" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v1", device_id: "3329890834", file_id: "5910974513607797", birthtime_ns: "1787985336406033800", root_sha256: "e8e6c595435313c977883fe7d9dbef165bf9e66002c320d5012c0f518192ec5c" },
    },
    reservations: 1,
    durable_handoffs: 0,
    provider_posts: 0,
    refresh_posts: 0,
    provider_active_milliseconds: 0,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "60e6db997f57efb769744573098e69d7182b22d3df1993370de796dd1dec3633",
    activation_sha256: "681bd04fdc22655f36755b010268931d80484775b8322cf03648c328ef57e39b",
    terminal_sha256: "cdfcacd4a1c9e1bd78b344136cc333f59cda24ce6b53982e8810f23bc0b45a79",
    state: "indeterminate-no-replay-after-provider-reachable-handoff-with-null-accounting",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v2", device_id: "3329890834", file_id: "5066549583475854", birthtime_ns: "1788026002778840700", root_sha256: "342651ca09e61e735430ece5134a38f4ec4129acab0e9f4423aa34c8901a276e" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v2", device_id: "3329890834", file_id: "6755399443739791", birthtime_ns: "1788026002781882600", root_sha256: "30f52bf56975472ce858908bfac6d8114cfaa1aba343f00d1b355c5e3494ca98" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v2", device_id: "3329890834", file_id: "9288674234135696", birthtime_ns: "1788026002783397900", root_sha256: "947d7f14d4ccc3b3654078fcd30b758a6cd748dd58fe0afa0e03f65b640dd1ef" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: null,
    refresh_posts: null,
    provider_active_milliseconds: null,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "76df5e8c2b9cf1586945c8e9d48dd719f2187294f5d7462e31f6e3a51b3d127a",
    activation_sha256: "a81710fc37609cbfc2992cb5ce554b153e30b44202505677704d0412017e5a01",
    terminal_sha256: "74e1a0dc62aa41d3fa7f9253804b2ef4fdd3bcc0d103cb68fd5581e44d37a220",
    state: "indeterminate-no-replay-after-provider-reachable-handoff-with-null-accounting",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v3-final", device_id: "3329890834", file_id: "9570149210846370", birthtime_ns: "1788030180533486400", root_sha256: "010abcf579268fc1efc63cb8d4f058cd9f5df781e14079c8c65fb4fc9da01b2c" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v3-final", device_id: "3329890834", file_id: "10133099164267683", birthtime_ns: "1788030180533486400", root_sha256: "636c6b9f898a7f0cecd89db1907c53b1862cb4f2fab0b9cd4de2426bc53eac74" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v3-final", device_id: "3329890834", file_id: "11258999071110308", birthtime_ns: "1788030180535010300", root_sha256: "61fc9fde688f9b4e810634624e2b71ecef4b75a10a0ae1fdbdffb005e22c767c" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: null,
    refresh_posts: null,
    provider_active_milliseconds: null,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "876fc03de58016eb3628dbc5c37c2755ddaf01281e5b3a89e5fe858c323c4d7f",
    activation_sha256: "e28573ed233dfbb743deba8f5328691ff262a0589376a778f47c277ff65ed440",
    terminal_sha256: "5248c3a33ca12fc59d2e98a97ccb7d4a9da1cb58bf2baf96b7fac0c842bb8975",
    state: "indeterminate-no-replay-after-provider-reachable-handoff-with-null-accounting",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v4-final", device_id: "3329890834", file_id: "12103424001242302", birthtime_ns: "1788033262432253800", root_sha256: "8211c917c745a6ac8bbdbb2f3f9c27b7a66e0a5645d6b8e3b316915c50f3e3bc" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v4-final", device_id: "3329890834", file_id: "12666373954663615", birthtime_ns: "1788033262432765800", root_sha256: "db7a28de5f1affff6a5ef5105826b1c8984c9579296d9c94a712124a706f348f" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v4-final", device_id: "3329890834", file_id: "11821949024531648", birthtime_ns: "1788033262432765800", root_sha256: "9fd2c80ba661dea71fddf0f5e6b969de0f329093cd580c13e871743e79ddb630" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: null,
    refresh_posts: null,
    provider_active_milliseconds: null,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "3f400034292479f23690743b7b2c5edaaceec4401d5e1b90cd7ff97588f2ed25",
    activation_sha256: "909e20796a2ea0e83d1bc19a61c5e4684cf391a08f9050d243b0b25c7044add2",
    terminal_sha256: "236692dea9a81e62bfaaf10ff6498c875b6e245f440dd311727e8bb08c0f68cd",
    state: "indeterminate-no-replay-provider-terminal-error-unavailable-after-operator-observed-vpn-disconnection",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v5-final", device_id: "3329890834", file_id: "20266198325851354", birthtime_ns: "1788038404596725400", root_sha256: "dd76af564b135692f40b55031ae68a4abb3ec9a37d62a26cb0bca89ffaffd993" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v5-final", device_id: "3329890834", file_id: "42502721485993179", birthtime_ns: "1788038404598292800", root_sha256: "0e07949c8272c35277c9486683aa89c6056a80c1b8d2943f2dc122f2f96b28a6" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v5-final", device_id: "3329890834", file_id: "45035996276389084", birthtime_ns: "1788038404598292800", root_sha256: "33fbbf878f47d2a3f0ee0eba06ed1236ad05fdae612c5ff99810e31ca2615e00" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 793,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "b13ed0f99167cb44af81d413e2afa6569e83eb0197dc931e2ca7b933ff8d9f0b",
    activation_sha256: "4994556f771b1ad89f63fb9ec29522e2f38b81cd080611bb6c2f3eb06fa45964",
    terminal_sha256: "f5283d32fe99c7552a6d70cd6cf80a6c089fab2a9dc3ce11acf19cef62d7dad1",
    state: "indeterminate-no-replay-pre-ack-treatment-dispatch-schema-mismatch-provider-unreachable",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v6-final", device_id: "3329890834", file_id: "21673573209404661", birthtime_ns: "1788041309138485400", root_sha256: "93e9ea9ed298d47156393f00c724fbd1bf0f2054e49ec8f211a891a859cf9950" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v6-final", device_id: "3329890834", file_id: "18858823442298102", birthtime_ns: "1788041309140005500", root_sha256: "bc38364237dc97fde838489be1233eb407550efd8f5e26430acccf6d1dc8af0e" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v6-final", device_id: "3329890834", file_id: "14636698791638263", birthtime_ns: "1788041309140005500", root_sha256: "83615a35fd6f3ef11413e06cc4eec18dd6526b2c569e99745d57a4689c578211" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 0,
    refresh_posts: 0,
    provider_active_milliseconds: 0,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "25077e319068f9a6d5bb52a0fe9fb888fe0f73cb883d500c0953f117cf775a3a",
    activation_sha256: "a4de3cb1e31690f4fc48f7cc0dac944bdcb436d59551537c4dae48ef81e8749e",
    terminal_sha256: "e6bdd5cbf2af0793369ebb13ee6c16a39422397b5d1eb155ac21c9118c64cdff",
    state: "indeterminate-no-replay-output-usage-target-exceeded-before-artifact-publication",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v7-final", device_id: "3329890834", file_id: "21673573209404690", birthtime_ns: "1788048342253642500", root_sha256: "59d50b10f3ce03530d5f602b14dc7df2d85dc13ea84bda4ab570d06817e9965e" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v7-final", device_id: "3329890834", file_id: "21673573209404691", birthtime_ns: "1788048342253642500", root_sha256: "a483372d5db7e1b3f98743577e1da83cf4fb8132d2e2bd9a4ba3c4d7eb6c2b33" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v7-final", device_id: "3329890834", file_id: "22236523162826004", birthtime_ns: "1788048342255157900", root_sha256: "117079d386b12e07aa0504ece16879efa132d6b2c388f0cf38a4f8168bd18514" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 153_642,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "59a5b8b350f2c5eedb70f9bef0173c254b0d5945aee427c5482be050bfad95af",
    activation_sha256: "0c18de85f9291ffa03cbf710a3edee5080c11c3c727db3702f578b7303bf0a62",
    terminal_sha256: "96d9b2c9b16db7d65e90d80124811609ee868a257ce3aa674bf24f3e1c447533",
    state: "indeterminate-no-replay-malformed-output-before-artifact-publication",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v8-audit-repaired-final", device_id: "3329890834", file_id: "18858823442298184", birthtime_ns: "1788050872017635100", root_sha256: "bd1716e35f36ca161ede2dfe0ed04ac8bb1c93248bb66c057d3904398525a1a4" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v8-audit-repaired-final", device_id: "3329890834", file_id: "59391220088632649", birthtime_ns: "1788050872019666500", root_sha256: "3c06794cf8695482817fa915ea9cbc91ceb4f7945eb2ea158d1d654016a6dac7" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v8-audit-repaired-final", device_id: "3329890834", file_id: "18295873488876874", birthtime_ns: "1788050872022204100", root_sha256: "bdd8632c75eb2f0fad8a724ccbf0a0d41f7f68219420126d3fc50f97abf8b5b8" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 118_799,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "af47c2150e6503f3016884c22c1a5c7ab52828bef22d0926fd8fac59800154a9",
    activation_sha256: "01fb1ca47222409b3565464168beab91e996ec3b0029a8762666b52c49b52ad8",
    terminal_sha256: "8b7a643127eccbd19f928f56571da7d1709382e54c8cf3efdff0820bcd2669a5",
    state: "indeterminate-no-replay-malformed-output-before-artifact-publication",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v9-one-lf-final", device_id: "3329890834", file_id: "4503599630055034", birthtime_ns: "1788056146973907100", root_sha256: "ff26dfa4f82ab02b30882724145037c69e3793d036d203692f07d4c1dc733a2e" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v9-one-lf-final", device_id: "3329890834", file_id: "4503599630055035", birthtime_ns: "1788056146978457600", root_sha256: "b672fc954919b6b17ded9bd1320082fe41e748000104b9178fdc34a4653a0aa0" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v9-one-lf-final", device_id: "3329890834", file_id: "5348024560187004", birthtime_ns: "1788056146979987700", root_sha256: "dade2c4f669b570c8405c1071ab4213162aaf47222cd67b7fddbce916c30dbf2" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 73_041,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "27bdeeb36557b41ac4c0bc72096fe23e16bd9fe5b7fc86b4d5cb9e39d50c3930",
    activation_sha256: "e35656d758eefb4b88a0a13b774ae441b64d829a5b768edf58192e20603c4c7f",
    terminal_sha256: "a7039c5f5975b421c8ecce513f05e8988f8bff06dbac923b74152c190eb5d56b",
    state: "indeterminate-no-replay-malformed-output-before-artifact-publication",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v10-stream-close-final", device_id: "3329890834", file_id: "8162774327293624", birthtime_ns: "1788060915880238000", root_sha256: "b9ecaf5db56cd2f6f5368b918444b51f3bff5eb92c60a0eb6d33a3609c903993" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v10-stream-close-final", device_id: "3329890834", file_id: "9288674234136249", birthtime_ns: "1788060915881763300", root_sha256: "926fccc7ebc236dd6c046d0cb40629b6a447c888c8d3c0a884445657d58c3268" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v10-stream-close-final", device_id: "3329890834", file_id: "8444249304004282", birthtime_ns: "1788060915881763300", root_sha256: "9c2e7e7555e49fe1bbe606dce1124ffa6c8ce5d96d77d68a278fe716fdca7882" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 248_182,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "600dfbc58eaa010a1bff11acf18bd6222fd50fb51a4edb6b0b20c62a413ce6a8",
    activation_sha256: "1b2753eb6836a9b404f5b8be7e3f3e6c5262bbdb7338347ab4821992149dd9a5",
    terminal_sha256: "e547887ff3dd19be395b738c3fcf31de12380af1c47123202f223e9591daba1f",
    state: "indeterminate-no-replay-malformed-output-evidence-item-before-artifact-publication",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v11-grammar-phase-final", device_id: "3329890834", file_id: "7881299350582996", birthtime_ns: "1788062270099289500", root_sha256: "fbfa926198acea86cbc1c3af4e1d82370c531b80b24d15402fb1e6285fe2db7b" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v11-grammar-phase-final", device_id: "3329890834", file_id: "6755399443740374", birthtime_ns: "1788062270099289500", root_sha256: "62486302cae84fc99db1c4a0dad45bc8e970dfd77a98cd70e21a45d8858d202b" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v11-grammar-phase-final", device_id: "3329890834", file_id: "9570149210846935", birthtime_ns: "1788062270100811800", root_sha256: "aef314c1fa134f02165c75a1645e194749d39b914fe5d43db0e1ba662a2abe33" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 133_088,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
  {
    closure_sha256: "13d61c3474b694b308d0de10246ebe55bd9967dc6639515d86f4b620613b980d",
    activation_sha256: "492a2fead822593c386cc4c7a5cfafa40f693bdb943e5108d80a3a0365dfbb25",
    terminal_sha256: "0cd7561d5b96877bb80a5fde97007c6308cf478ffec4ba47f52e7f61c3b6f0e3",
    state: "indeterminate-no-replay-after-trusted-top-level-before-contained-proof-with-unbound-container-identity-failure",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v12-contract-id-final", device_id: "3329890834", file_id: "7599824373872427", birthtime_ns: "1788064496303443900", root_sha256: "14523c29ce902eaa030e5d9ba30065fb7ac3958496c1fc1944b20cf625d1754d" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v12-contract-id-final", device_id: "3329890834", file_id: "8444249304004396", birthtime_ns: "1788064496304951900", root_sha256: "770957fdfef9f24564cb796c12f6cb6239a3999a287c1d62a76f284c33cefa38" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v12-contract-id-final", device_id: "3329890834", file_id: "5066549583476525", birthtime_ns: "1788064496305455700", root_sha256: "2f3b94ba1f0e0565cec4e01b7f64f304f66895e82eb89a5e9487b7ac124da953" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 81_922,
    child_requests: 0,
    rlm_executions: null,
    docker_invocations: null,
  },
  {
    closure_sha256: "0235963fbcf59f971c3d370274454511ab7a3053d944dbedb17a3eab39a490f6",
    activation_sha256: "bf764b8731b612df3e4ce990c60c3b43a7d43e8d09da3f187aa93a286622a9ad",
    terminal_sha256: "162a563792bf985d9745249911ce812f0e89122ff50138c5ceec20062653515e",
    state: "indeterminate-no-replay-after-trusted-top-level-with-unbound-rlm-program-envelope-failure",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v13-worker-label-final", device_id: "3329890834", file_id: "6755399443740509", birthtime_ns: "1788066461528000800", root_sha256: "e9197899613c9de4b859a180b1be362ae4eeba4fce7a205a268ac34422996e85" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v13-worker-label-final", device_id: "3329890834", file_id: "7881299350583134", birthtime_ns: "1788066461528000800", root_sha256: "6530253526f4cb366dcd266bdfce97afcccf4b11f8507fc9da1b2cc8718af61d" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v13-worker-label-final", device_id: "3329890834", file_id: "7318349397161823", birthtime_ns: "1788066461529557900", root_sha256: "12a04440ff9548887cb95dd482321364d3759379e876caeb63b9bc7f31baf9ce" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 119_454,
    child_requests: 0,
    rlm_executions: null,
    docker_invocations: null,
  },
  {
    closure_sha256: "8c0d7c67449361ef60331d826432ee358f9513bf9d4611a8d897e9951823443b",
    activation_sha256: "473f21a408592c4d433730a8945ca482820958d32d27fc56acc537db7d26ad5a",
    terminal_sha256: "9e0d781d8a40aa0f139a25c697e441dc9294ac08d3fb9405aab2f399810be6f0",
    state: "indeterminate-no-replay-after-trusted-top-level-with-unbound-rlm-program-oversized-before-container",
    roots: {
      ledger: { schema_version: "rc7-gate-c-treatment-proof-ledger-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-ledger-v14-program-envelope-final", device_id: "3329890834", file_id: "6755399443740550", birthtime_ns: "1788067700302638000", root_sha256: "6699f55ecdb6b10c407c83fbde6ef40a0396d15c9f4ca01b2a397d2b17db3cf8" },
      results: { schema_version: "rc7-gate-c-treatment-proof-results-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-results-v14-program-envelope-final", device_id: "3329890834", file_id: "8162774327293831", birthtime_ns: "1788067700302638000", root_sha256: "a2c90066c8504dd518d291dfa98005e4067b69a97e281e2deacfea2fc2571da6" },
      rlm: { schema_version: "rc7-gate-c-treatment-proof-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-treatment-proof-rlm-v14-program-envelope-final", device_id: "3329890834", file_id: "8444249304004488", birthtime_ns: "1788067700304200800", root_sha256: "180b55b8ba31e11f0bf586d387615f41b9ac468bce557b073c05c322669203f9" },
    },
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 184_816,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  },
]);

export class Rc7GateCTreatmentProofError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCTreatmentProofError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCTreatmentProofError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) {
    fail("TREATMENT_PROOF_IDENTITY_MISMATCH", `${label} keys mismatched`);
  }
}

function projection(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function normalized(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/[\\]+$/u, "").toLowerCase();
}

function normalizedPhysicalPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function nestedOrSame(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertRoot(root, requireEmpty = false) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("UNSAFE_TREATMENT_PROOF_ROOT", "Treatment-proof roots must be explicit absolute paths");
  const resolved = path.resolve(root);
  const segments = resolved.split(/[\\/]+/u).filter(Boolean).map((item) => item.toLowerCase());
  if (segments.length < 3 || normalized(resolved) === normalized(path.parse(resolved).root)
    || segments.some((item) => PROTECTED_SEGMENTS.has(item) || /(?:credential|oauth|secret|token)/u.test(item))) {
    fail("UNSAFE_TREATMENT_PROOF_ROOT", "Broad, user-layer, and credential-like treatment-proof roots are denied");
  }
  if (nestedOrSame(REPOSITORY_ROOT, resolved) || nestedOrSame(resolved, REPOSITORY_ROOT)
    || normalized(resolved) === normalized(homedir()) || normalized(resolved) === normalized(tmpdir())
    || nestedOrSame(resolved, homedir()) || nestedOrSame(resolved, tmpdir())
    || (nestedOrSame(homedir(), resolved) && !nestedOrSame(tmpdir(), resolved))) {
    fail("UNSAFE_TREATMENT_PROOF_ROOT", "Treatment-proof root overlaps a protected or broad path");
  }
  let stat;
  try { stat = await lstat(resolved, { bigint: true }); } catch { fail("MISSING_TREATMENT_PROOF_ROOT", "Caller must create every treatment-proof root"); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(await realpath(resolved)) !== normalized(resolved)) {
    fail("ALIASED_TREATMENT_PROOF_ROOT", "Treatment-proof roots must be physical, non-aliased directories");
  }
  if (requireEmpty && (await readdir(resolved)).length !== 0) fail("NONEMPTY_TREATMENT_PROOF_ROOT", "Treatment-proof preparation requires empty roots");
  return { root: resolved, stat };
}

function assertDisjointRoots(values) {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (nestedOrSame(values[left], values[right]) || nestedOrSame(values[right], values[left])) {
        fail("OVERLAPPING_TREATMENT_PROOF_ROOTS", "Freeze, ledger, results, and RLM roots must be disjoint");
      }
    }
  }
}

function rootIdentity(kind, safe) {
  return withDigest({
    schema_version: `rc7-gate-c-treatment-proof-${kind}-root-identity-v1`,
    normalized_physical_root: normalizedPhysicalPath(safe.root),
    device_id: String(safe.stat.dev),
    file_id: String(safe.stat.ino),
    birthtime_ns: String(safe.stat.birthtimeNs),
  }, "root_sha256");
}

function assertFreshTreatmentProofRoots(currentRoots) {
  const priorRoots = SUPERSEDED_TREATMENT_PROOFS.flatMap((proof) => Object.values(proof.roots));
  for (const current of Object.values(currentRoots)) {
    for (const prior of priorRoots) {
      const samePath = current.normalized_physical_root === prior.normalized_physical_root;
      const sameDigest = current.root_sha256 === prior.root_sha256;
      const samePhysicalObject = current.device_id === prior.device_id && current.file_id === prior.file_id
        && current.birthtime_ns === prior.birthtime_ns;
      if (samePath || sameDigest || samePhysicalObject) {
        fail("SUPERSEDED_TREATMENT_PROOF_ROOT", "Fresh proof roots must not reuse, recreate, alias, or substitute any immutable prior proof root");
      }
    }
  }
}

async function conformanceRecord(rlmRoot, ledgerRoot, requireManifest) {
  const [rlm, ledger] = await Promise.all([assertRoot(rlmRoot), assertRoot(ledgerRoot)]);
  assertDisjointRoots([rlm.root, ledger.root]);
  const dockerConfig = await assertPhysicalDirectory(path.join(ledger.root, DOCKER_CONFIG_DIR), "provider-free conformance Docker config");
  if ((await readdir(dockerConfig)).length !== 0) fail("TREATMENT_PROOF_CONFORMANCE_MISMATCH", "Provider-free conformance Docker config contains residue");
  const expectedLedgerEntries = requireManifest
    ? [DOCKER_CONFIG_DIR, RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME].sort()
    : [DOCKER_CONFIG_DIR];
  if (canonicalJsonV1((await readdir(ledger.root)).sort()) !== canonicalJsonV1(expectedLedgerEntries)) {
    fail("TREATMENT_PROOF_CONFORMANCE_MISMATCH", "Provider-free conformance ledger layout mismatched");
  }
  const [context, retained] = await Promise.all([
    inspectRc7GateCRlmLauncher(rlm.root),
    inspectRc7GateCRlmCompletedArtifact(rlm.root),
  ]);
  let brokerCallbackInvoked = false;
  const service = await serviceRc7GateCRlmChildProposal(rlm.root, async () => {
    brokerCallbackInvoked = true;
    fail("TREATMENT_PROOF_CONFORMANCE_MISMATCH", "Provider-free conformance has an unsealed child request");
  });
  const expectedChildren = ["0001.json", "0002.json", "0003.json", "0004.json"];
  const requestEntries = (await readdir(path.join(rlm.root, "exchange", "requests"))).sort();
  const responseEntries = (await readdir(path.join(rlm.root, "exchange", "responses"))).sort();
  if (brokerCallbackInvoked || service.serviced || service.sequence !== null
    || canonicalJsonV1(requestEntries) !== canonicalJsonV1(expectedChildren)
    || canonicalJsonV1(responseEntries) !== canonicalJsonV1(expectedChildren)
    || retained.final_artifact.child_request_count !== 4
    || retained.final_artifact.cleanup_residue_entries !== 0
    || retained.final_artifact.image_id !== RC7_GATE_C_RLM_IMAGE_ID
    || retained.launch.worker_sha256 !== context.image_definition.files.worker.sha256
    || retained.final_artifact.phase_two_sha256 !== retained.phase_two.phase_two_sha256) {
    fail("TREATMENT_PROOF_CONFORMANCE_MISMATCH", "Provider-free RLM conformance is incomplete or mismatched");
  }
  const value = withDigest({
    schema_version: "rc7-gate-c-treatment-proof-provider-free-rlm-conformance-v1",
    state: "provider-free-contained-four-child-proof-cleanup-verified",
    rlm_root_identity: rootIdentity("provider-free-conformance-rlm", rlm),
    ledger_root_identity: rootIdentity("provider-free-conformance-ledger", ledger),
    image_id: RC7_GATE_C_RLM_IMAGE_ID,
    image_definition_sha256: context.image_definition.image_definition_sha256,
    worker_sha256: context.image_definition.files.worker.sha256,
    launch_package_sha256: context.package.package_sha256,
    live_inspect_sha256: retained.live_inspect.attestation_sha256,
    program_sha256: retained.program.program_sha256,
    phase_two_sha256: retained.phase_two.phase_two_sha256,
    container_result_sha256: retained.container_result.result_sha256,
    final_artifact_sha256: retained.final_artifact.artifact_sha256,
    child_request_count: 4,
    python_code_byte_ceiling: RC7_GATE_C_RLM_LIMITS.program_bytes,
    route_output_byte_ceiling: 65_536,
    exchange_package_byte_ceiling: RC7_GATE_C_RLM_LIMITS.exchange_artifact_bytes,
    cleanup_residue_entries: 0,
    accounting: {
      provider_calls: 0,
      oauth_refresh_posts: 0,
      credential_accesses: 0,
      external_network_requests: 0,
      synthetic_child_responses: 4,
      rlm_executions: 1,
      docker_executions: 1,
    },
  }, "conformance_sha256");
  if (requireManifest) {
    const manifest = await readCanonical(path.join(ledger.root, RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME), "TREATMENT_PROOF_CONFORMANCE");
    if (canonicalJsonV1(manifest) !== canonicalJsonV1(value)) fail("TREATMENT_PROOF_CONFORMANCE_MISMATCH", "Provider-free conformance manifest mismatched its retained evidence");
  }
  return value;
}

export async function recordRc7GateCTreatmentProofProviderFreeConformance(rlmRoot, ledgerRoot) {
  const value = await conformanceRecord(rlmRoot, ledgerRoot, false);
  await writeExclusive(path.join(path.resolve(ledgerRoot), RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME), value);
  return value;
}

export async function inspectRc7GateCTreatmentProofProviderFreeConformance(rlmRoot, ledgerRoot) {
  return conformanceRecord(rlmRoot, ledgerRoot, true);
}

async function fileIdentity(relativePath) {
  const target = path.resolve(REPOSITORY_ROOT, relativePath);
  if (!nestedOrSame(REPOSITORY_ROOT, target)) fail("TREATMENT_PROOF_EXECUTION_CLOSURE_MISMATCH", "Execution file escaped the repository");
  const bytes = await readFile(target);
  return { path: relativePath.replaceAll("\\", "/"), byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function exactTopRequest() {
  const request = await buildRc7GateCRequestIntent({
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
    request_kind: "top-level",
    child_sequence: 0,
    child_question: null,
    excerpt_locator: null,
  });
  if (request.intent.case_id !== "LAB-01" || request.intent.arm !== "rc-rlm" || request.intent.selected_route !== "rc-rlm"
    || request.intent.repeat_index !== 3) {
    fail("TREATMENT_PROOF_RUN_MISMATCH", "Frozen treatment-proof run is no longer the exact LAB-01 treatment row");
  }
  return request;
}

async function executionClosure(preregistration) {
  const files = await Promise.all([
    "lib/recursus/rc7-rlm-gate-c-treatment-proof.mjs",
    "lib/recursus/rc7-rlm-gate-c-treatment-spec.mjs",
    "scripts/recursus/rc7-rlm-gate-c-treatment-proof.mjs",
    "lib/recursus/rc7-rlm-gate-c-executor.mjs",
    "lib/recursus/rc7-rlm-gate-c-host-launcher.mjs",
    "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs",
    "lib/recursus/rc7-rlm-gate-c-worker.mjs",
    "lib/recursus/rc7-rlm-gate-c-broker.mjs",
    "lib/recursus/rc7-rlm-gate-c-preregistration.mjs",
    "lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs",
    "lib/recursus/rc7-rlm-gate-c-scorer.mjs",
    "tests/recursus/fixtures/rc7-rlm-gate-c-container/gate-c-rlm-worker.mjs",
    "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-default-errno.json",
  ].map(fileIdentity));
  return withDigest({
    schema_version: "rc7-gate-c-treatment-proof-execution-closure-v1",
    files,
    worker_stage_manifest_sha256: preregistration.repository.gate_c_worker.worker_stage.stage_manifest_sha256,
    live_capsule_sha256: preregistration.repository.gate_c_worker.live_capsule.sha256,
    worker_package_sha256: preregistration.repository.gate_c_worker.worker_package_sha256,
    broker_package_sha256: (await buildRc7GateCBrokerConformancePackage()).broker_package_sha256,
    scorer_contract_sha256: sha256V1(canonicalJsonV1(preregistration.repository.gate_c_scorer)),
    rlm_image_id: RC7_GATE_C_RLM_IMAGE_ID,
  }, "execution_closure_sha256");
}

function approvalTextV8(closureSha256, closure) {
  const seventh = closure.supersession.prior_proofs[6];
  return `I explicitly approve RC-7 Gate C seventh repaired one-treatment proof closure ${closureSha256} for physical ledger root ${closure.roots.ledger.root_sha256}, results root ${closure.roots.results.root_sha256}, and RLM root ${closure.roots.rlm.root_sha256}, policy ${RC7_GATE_C_TREATMENT_PROOF_POLICY_ID}, exact non-matrix LAB-01 treatment run ${closure.run.run_id}, provider-visible top-level semantic request ${closure.run.top_level_semantic_request_sha256}, source pack ${closure.run.route_visible_source_pack_sha256}, provider openai-codex, adapter revision 2fc02090af1632b86ee1175a6720904dfd71081c, configured model gpt-5.6-sol, xhigh reasoning, and pinned RLM image ${RC7_GATE_C_RLM_IMAGE_ID}. I acknowledge seven immutable excluded proof attempts and all twenty-one prior physical ledger, results, and RLM root identities. The first six proofs remain exactly as bound in this closure and are immutable, excluded, no-replay evidence. The seventh proof closure ${seventh.closure_sha256}, activation ${seventh.activation_sha256}, physical ledger ${seventh.roots.ledger.root_sha256}, and terminal ${seventh.terminal_sha256} retained one top-level reservation, one durable provider handoff, one provider POST, zero refreshes, zero retries, and 153,642 provider-active milliseconds, then stopped before trusted artifact publication with USAGE_BUDGET_EXCEEDED because the provider-reported output count crossed the 8,192 post-response target. Exact input and output usage were not retained, so the full approved v7 ceiling remains conservatively charged. It produced zero child requests, RLM executions, Docker invocations, results, scores, or matrix evidence. All seven prior attempts remain immutable, excluded, and unavailable for replay or root reuse. I approve five logical generation requests plus exactly one global replacement reservation, at most six generation HTTPS POSTs, up to six OAuth-refresh HTTPS POSTs, twelve total HTTPS POSTs, one contained RLM execution, one Docker container execution with broker-owned read-only inspection, zero WSL invocations, zero adapter-level automatic retries, concurrency one, 196,608 semantic-input UTF-8 bytes and conservative input tokens total, an 8,192 output-plus-reasoning requested target per request and 49,152 total target, a hard proof-acceptance and provider-authority ceiling of 128,000 output-plus-reasoning tokens per request and 768,000 total, up to 1,048,576 discarded replay-state UTF-8 bytes per response and 6,291,456 total, stream block indexes from zero through 65,535, up to 65,536 stream chunks per response, a 300-second top-level provider-active ceiling, 120 seconds per recursive child, one replacement charged at the replaced route's ceiling, and 1,080 provider-active seconds total, a fixed 15-second replacement backoff, 30-second host acknowledgment, 345-second top-level host process, 120-second child response, 300-second RLM wall, 30-second Docker command, 1,000-second attempt, and 1,100-second retained-failure/recovery walls, 403.67 planning credits, USD 16.16 API-equivalent planning amount, zero purchases, and no matrix membership, score, replay, publication, deployment, or comparative decision. The 128,000 proof acceptance applies only to this non-score treatment proof; the future matrix remains locked to its existing 8,192 acceptance rule until a separate post-proof matrix repair is frozen. The replacement is a new durable reservation and nonce, never a replay of a consumed dispatch, and is allowed only once globally after a durably sealed PROVIDER_TERMINAL_ERROR_UNAVAILABLE, PROVIDER_TERMINAL_ERROR_TIMEOUT, or PROVIDER_TERMINAL_ERROR_RATE_LIMIT terminal; every other failure and any second failure stops. Provider-active milliseconds are conservatively charged no higher than each route-specific approved timeout after local abort signaling; this does not prove remote cancellation timing, receipt, or billing. Any sanitized failure detail and charged local counters must be durably sealed without provider prose, reasoning, replay state, HTTP status, request identifiers, credential bytes, or DSH_HOME. I acknowledge cumulative disclosed ceilings through preserved history plus this proposed proof of 126 generation POSTs, 125 OAuth-refresh POSTs, 251 total POSTs, 4,096,073 input tokens, 6,176,000 output-plus-reasoning tokens, 16,380 provider-active seconds, 3,504.94 planning credits, and USD 140.29 API-equivalent, with zero purchase authority. The backend snapshot and native tokenizer remain unreported; subscription pricing applicability remains unproven; same-host durable approval is governance rather than protection from a hostile administrator; and Docker inspection proves the outer live contract but phase-two TSYNC is accepted only from the final contained result.`;
}

function approvalTextV10(closureSha256, closure) {
  const ninth = closure.supersession.prior_proofs[8];
  return `I explicitly approve RC-7 Gate C ninth repaired one-treatment proof closure ${closureSha256} for physical ledger root ${closure.roots.ledger.root_sha256}, results root ${closure.roots.results.root_sha256}, and RLM root ${closure.roots.rlm.root_sha256}, policy ${RC7_GATE_C_TREATMENT_PROOF_POLICY_ID}, exact non-matrix LAB-01 treatment run ${closure.run.run_id}, provider-visible top-level semantic request ${closure.run.top_level_semantic_request_sha256}, source pack ${closure.run.route_visible_source_pack_sha256}, provider openai-codex, adapter revision 2fc02090af1632b86ee1175a6720904dfd71081c, configured model gpt-5.6-sol, xhigh reasoning, and pinned RLM image ${RC7_GATE_C_RLM_IMAGE_ID}. I acknowledge nine immutable excluded proof attempts and all twenty-seven prior physical ledger, results, and RLM root identities; the closure binds their complete exact records. The ninth proof closure ${ninth.closure_sha256}, activation ${ninth.activation_sha256}, physical ledger ${ninth.roots.ledger.root_sha256}, and terminal ${ninth.terminal_sha256} retained one top-level reservation, one durable provider handoff, one provider POST, zero refreshes, zero retries, and 73,041 provider-active milliseconds, then stopped before trusted artifact publication with MALFORMED_OUTPUT. It produced zero child requests, RLM executions, Docker invocations, results, scores, or matrix evidence. The exact rejected provider bytes and grammar subpredicate were deliberately unretained, so the full approved v9 ceiling remains conservatively charged and the attempt is immutable, excluded, no-replay, and unavailable for root reuse. Policy v10 changes only the shared direct/RLM score-bearing output ingress: it accepts one bounded RFC 8259 JSON document with harmless whitespace and object-key ordering, prohibits duplicate member names and any prose or fencing, validates the same exact keys, closed values, locators, calculations, and collection bounds, then canonicalizes to one final LF before hashing or scoring. It does not change route selection, source or evaluator authority, scoring semantics, child count, RLM mechanism, containment, or request ceilings. I approve five logical generation requests plus exactly one global replacement reservation, at most six generation HTTPS POSTs, up to six OAuth-refresh HTTPS POSTs, twelve total HTTPS POSTs, one contained RLM execution, one Docker container execution with broker-owned read-only inspection, zero WSL invocations, zero adapter-level automatic retries, concurrency one, 196,608 semantic-input UTF-8 bytes and conservative input tokens total, an 8,192 output-plus-reasoning requested target per request and 49,152 total target, a hard proof-acceptance and provider-authority ceiling of 128,000 output-plus-reasoning tokens per request and 768,000 total, up to 1,048,576 discarded replay-state UTF-8 bytes per response and 6,291,456 total, stream block indexes from zero through 65,535, up to 65,536 stream chunks per response, a 300-second top-level provider-active ceiling, 120 seconds per recursive child, one replacement charged at the replaced route's ceiling, and 1,080 provider-active seconds total, a fixed 15-second replacement backoff, 30-second host acknowledgment, 345-second top-level host process, 120-second child response, 300-second RLM wall, 30-second Docker command, 1,000-second attempt, and 1,100-second retained-failure/recovery walls, 403.67 planning credits, USD 16.16 API-equivalent planning amount, zero purchases, and no matrix membership, score, replay, publication, deployment, or comparative decision. The 128,000 proof acceptance applies only to this non-score treatment proof; the future matrix remains locked to 8,192 until a separate post-proof matrix repair and prompt-identity freeze. The replacement is a new durable reservation and nonce, never a replay of a consumed dispatch, and is allowed only once globally after a durably sealed PROVIDER_TERMINAL_ERROR_UNAVAILABLE, PROVIDER_TERMINAL_ERROR_TIMEOUT, or PROVIDER_TERMINAL_ERROR_RATE_LIMIT terminal; every other failure and any second failure stops. Provider-active milliseconds are conservatively charged no higher than each route-specific approved timeout after local abort signaling; this does not prove remote cancellation timing, receipt, or billing. Any sanitized failure detail and charged local counters must be durably sealed without provider prose, reasoning, replay state, HTTP status, request identifiers, credential bytes, or DSH_HOME. I acknowledge cumulative disclosed ceilings through preserved history plus this proposed proof of 138 generation POSTs, 137 OAuth-refresh POSTs, 275 total POSTs, 4,489,289 input tokens, 7,712,000 output-plus-reasoning tokens, 18,540 provider-active seconds, 4,312.28 planning credits, and USD 172.61 API-equivalent, with zero purchase authority. The backend snapshot and native tokenizer remain unreported; subscription pricing applicability remains unproven; same-host durable approval is governance rather than protection from a hostile administrator; and Docker inspection proves the outer live contract but phase-two TSYNC is accepted only from the final contained result.`;
}

function approvalText(closureSha256, closure) {
  const fourteenth = closure.supersession.prior_proofs[13];
  return [
    `I explicitly approve RC-7 Gate C fifteenth one-treatment proof closure ${closureSha256} for physical ledger root ${closure.roots.ledger.root_sha256}, results root ${closure.roots.results.root_sha256}, and RLM root ${closure.roots.rlm.root_sha256}, policy ${RC7_GATE_C_TREATMENT_PROOF_POLICY_ID}, exact non-matrix LAB-01 treatment run ${closure.run.run_id}, provider-visible top-level semantic request ${closure.run.top_level_semantic_request_sha256}, source pack ${closure.run.route_visible_source_pack_sha256}, provider openai-codex, adapter revision 2fc02090af1632b86ee1175a6720904dfd71081c, configured model gpt-5.6-sol, xhigh reasoning, and pinned RLM image ${RC7_GATE_C_RLM_IMAGE_ID}.`,
    `I acknowledge fourteen immutable excluded proof attempts and all forty-two prior physical ledger, results, and RLM root identities; the closure binds their complete exact records. The fourteenth proof closure ${fourteenth.closure_sha256}, activation ${fourteenth.activation_sha256}, physical ledger ${fourteenth.roots.ledger.root_sha256}, and trusted top-level terminal ${fourteenth.terminal_sha256} retained one reservation, one durable handoff, one provider POST, zero refreshes, zero retries, 463 input tokens, 1,792 cache-read tokens, 10,165 output tokens, and 184,816 provider-active milliseconds. It then stopped before any child reservation, Docker container, RLM execution, or combined artifact. An unbound operator-console envelope reported RLM_PROGRAM_OVERSIZED because the deterministic Python wrapper embedded the already-validated base result; the full approved v14 ceilings remain conservatively charged. It produced no score or matrix evidence and remains immutable, excluded, no-replay, and unavailable for root reuse.`,
    "Policy v15 separates executable code from validated data. The Python program remains capped at 16,384 UTF-8 bytes and reads the exact validated base output from a preloaded in-container variable; the closed program record independently carries that canonical base output and its SHA-256. The route output remains capped at 65,536 bytes, while the local canonical exchange package is capped at 131,072 bytes. The freshly built pinned image carries exact worker digest e1c5cd7307c7c329a08c5708a8e27b46e29e5cffdcd5cd7b10c5efcf6831099b. Provider-free live conformance on that exact worker shape must prove one contained RLM execution, phase-two TSYNC, four ordered synthetic child exchanges, deterministic combination, and zero cleanup residue before activation. Provider, configured model, reasoning, prompt, semantic request, source, evaluator, scoring semantics, child count, RLM mechanism, namespace, mounts, network, capabilities, seccomp, resources, and provider request ceilings are unchanged.",
    "I approve five logical generation requests plus exactly one global replacement reservation, at most six generation HTTPS POSTs, up to six OAuth-refresh HTTPS POSTs, twelve total HTTPS POSTs, one contained RLM execution, one Docker container execution with broker-owned read-only inspection, zero WSL invocations, zero adapter-level automatic retries, concurrency one, 196,608 semantic-input UTF-8 bytes and conservative input tokens total, an 8,192 output-plus-reasoning requested target per request and 49,152 total target, a hard proof-acceptance and provider-authority ceiling of 128,000 output-plus-reasoning tokens per request and 768,000 total, up to 1,048,576 discarded replay-state UTF-8 bytes per response and 6,291,456 total, stream block indexes from zero through 65,535, up to 65,536 stream chunks per response, a 300-second top-level provider-active ceiling, 120 seconds per recursive child, one replacement charged at the replaced route's ceiling, and 1,080 provider-active seconds total, a fixed 15-second replacement backoff, 30-second host acknowledgment, 345-second top-level host process, 120-second child response, 300-second RLM wall, 30-second Docker command, 1,000-second attempt, and 1,100-second retained-failure/recovery walls, 403.67 planning credits, USD 16.16 API-equivalent planning amount, zero purchases, and no matrix membership, score, replay, publication, deployment, or comparative decision.",
    "The 128,000 proof acceptance applies only to this non-score treatment proof; the future matrix remains locked to 8,192 until a separate post-proof matrix repair and prompt-identity freeze. The replacement is a new durable reservation and nonce, never a replay, and is allowed only once globally after a sealed provider unavailable, timeout, or rate-limit terminal; every other failure and any second failure stops.",
    "I acknowledge cumulative disclosed ceilings through preserved history plus this proposed proof of 168 generation POSTs, 167 OAuth-refresh POSTs, 335 total POSTs, 5,472,329 input tokens, 11,552,000 output-plus-reasoning tokens, 23,940 provider-active seconds, 6,330.63 planning credits, and USD 253.41 API-equivalent, with zero purchase authority. Backend snapshot, native tokenizer, subscription pricing applicability, remote cancellation and billing, and hostile-administrator resistance remain unproven; phase-two TSYNC is accepted only from the final contained result.",
  ].join(" ");
}

export async function buildRc7GateCTreatmentProofFreeze(ledgerRoot, resultsRoot, rlmRoot, conformanceRlmRoot, conformanceLedgerRoot) {
  const [ledger, results, rlm, preregistration, top, providerFreeConformance] = await Promise.all([
    assertRoot(ledgerRoot), assertRoot(resultsRoot), assertRoot(rlmRoot), buildRc7GateCPreregistrationPackage(), exactTopRequest(),
    inspectRc7GateCTreatmentProofProviderFreeConformance(conformanceRlmRoot, conformanceLedgerRoot),
  ]);
  assertDisjointRoots([
    ledger.root, results.root, rlm.root,
    providerFreeConformance.rlm_root_identity.normalized_physical_root,
    providerFreeConformance.ledger_root_identity.normalized_physical_root,
  ]);
  const roots = {
    ledger: rootIdentity("ledger", ledger),
    results: rootIdentity("results", results),
    rlm: rootIdentity("rlm", rlm),
  };
  assertFreshTreatmentProofRoots(roots);
  const closure = {
    schema_version: "rc7-gate-c-treatment-proof-closure-v1",
    policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
    state: "provider-free-frozen-no-live-authority",
    roots,
    run: {
      run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
      case_id: "LAB-01",
      arm: "rc-rlm",
      repeat_index: 3,
      selected_route: "rc-rlm",
      matrix_member: false,
      score_bearing: false,
      top_level_semantic_request_sha256: top.intent.semantic_request_sha256,
      top_level_semantic_request_byte_count: top.intent.semantic_request_byte_count,
      route_visible_source_pack_sha256: top.intent.route_visible_source_pack_sha256,
      evaluator_bytes_provider_visible: false,
    },
    supersession: {
      prior_proofs: structuredClone(SUPERSEDED_TREATMENT_PROOFS),
      excluded_from_repaired_proof: true,
    },
    provider_free_rlm_conformance: providerFreeConformance,
    transport: {
      provider: "openai-codex",
      adapter: "deepseek-openai-codex",
      adapter_revision: "2fc02090af1632b86ee1175a6720904dfd71081c",
      configured_model: "gpt-5.6-sol",
      reasoning: "xhigh",
      backend_snapshot: null,
      provider_native_tokenizer: null,
      native_request_output_cap_field: null,
    },
    budget: {
      top_level_reservations: 1,
      child_reservations: 4,
      total_generation_reservations: 6,
      logical_generation_requests: 5,
      global_transient_replacement_reservations: 1,
      generation_https_posts: 6,
      oauth_refresh_https_posts: 6,
      total_https_posts: 12,
      semantic_input_utf8_bytes_per_request: 32_768,
      conservative_input_tokens_total: 196_608,
      requested_output_plus_reasoning_target_per_request: 8_192,
      requested_output_plus_reasoning_target_total: 49_152,
      hard_output_plus_reasoning_authority_per_request: 128_000,
      hard_output_plus_reasoning_authority_total: 768_000,
      maximum_discarded_replay_state_utf8_bytes_per_request: 1_048_576,
      maximum_discarded_replay_state_utf8_bytes_total: 6_291_456,
      maximum_stream_block_index: 65_535,
      maximum_stream_chunks_per_response: 65_536,
      maximum_provider_active_seconds_per_request: 300,
      top_level_provider_active_seconds: 300,
      recursive_child_provider_active_seconds_per_request: 120,
      provider_active_seconds_total: 1_080,
      replacement_backoff_milliseconds: RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS,
      replaceable_failure_codes: [...REPLACEABLE_FAILURE_CODES].sort(),
      rlm_executions: 1,
      docker_container_executions: 1,
      docker_inspections: 4,
      wsl_invocations: 0,
      retries: 0,
      concurrency: 1,
      planning_credits: 403.67,
      api_equivalent_planning_usd: 16.16,
      additional_credit_purchases: 0,
      incremental_cash_purchases: 0,
    },
    ordering: "trusted-sealed top-level; prepared and started contained RLM; child sequences 1,2,3,4 each broker-inspected and trusted-sealed; combined contained artifact; cleanup",
    execution_closure: await executionClosure(preregistration),
    preregistration_sha256: preregistration.preregistration_sha256,
    prompt_bundle_sha256: preregistration.exact_comparison_identity.prompt_bundle_sha256,
    source_bundle_sha256: preregistration.exact_comparison_identity.source_bundle_sha256,
    evaluator_bundle_sha256: preregistration.exact_comparison_identity.evaluator_bundle_sha256,
    permission_policy_identity: "rc7-gate-c-treatment-proof-contained-brokered-v1",
    nonclaims: [
      "not a matrix member, score, replacement, replay, comparison, promotion, or RC-7 decision",
      "the 8192-token value is a post-response acceptance target, not a provider-side cap",
      "no provider, credential, RLM, Docker, WSL, or network authority exists before exact durable approval",
    ],
  };
  const closureSha256 = sha256V1(canonicalJsonV1(closure));
  const exactApprovalText = approvalText(closureSha256, closure);
  const approvalTextSha256 = sha256V1(exactApprovalText);
  const futureActivationSha256 = sha256V1(canonicalJsonV1({ closure_sha256: closureSha256, approval_text_sha256: approvalTextSha256, policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID }));
  return withDigest({
    schema_version: "rc7-gate-c-treatment-proof-freeze-v1",
    state: "awaiting-exact-one-treatment-approval",
    closure,
    closure_sha256: closureSha256,
    exact_approval_text: exactApprovalText,
    approval_text_sha256: approvalTextSha256,
    future_activation_sha256: futureActivationSha256,
    terminal_decision: "AWAITING_EXACT_ONE_TREATMENT_PROOF_APPROVAL",
    accounting: { provider_calls: 0, credential_accesses: 0, network_requests: 0, rlm_executions: 0, docker_invocations: 0, external_mutations: 0 },
  }, "freeze_sha256");
}

function validateFreeze(value) {
  if (value?.schema_version !== "rc7-gate-c-treatment-proof-freeze-v1" || value.state !== "awaiting-exact-one-treatment-approval"
    || value.closure?.policy_identity !== RC7_GATE_C_TREATMENT_PROOF_POLICY_ID
    || value.closure_sha256 !== sha256V1(canonicalJsonV1(value.closure))
    || value.exact_approval_text !== approvalText(value.closure_sha256, value.closure)
    || value.approval_text_sha256 !== sha256V1(value.exact_approval_text)
    || value.future_activation_sha256 !== sha256V1(canonicalJsonV1({ closure_sha256: value.closure_sha256, approval_text_sha256: value.approval_text_sha256, policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID }))
    || value.freeze_sha256 !== sha256V1(canonicalJsonV1(projection(value, "freeze_sha256")))) {
    fail("TREATMENT_PROOF_FREEZE_MISMATCH", "Treatment-proof freeze widened or mismatched");
  }
  return value;
}

async function readCanonical(target, label) {
  let bytes;
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || normalized(await realpath(target)) !== normalized(target)) {
      fail(`MALFORMED_${label}`, `${label} is linked, aliased, or not a regular file`);
    }
    bytes = await readFile(target);
  } catch (error) {
    if (error instanceof Rc7GateCTreatmentProofError) throw error;
    fail(`MISSING_${label}`, `${label} is missing`);
  }
  if (bytes.byteLength < 3 || bytes.byteLength > 2_097_152 || bytes[bytes.byteLength - 1] !== 0x0a) fail(`MALFORMED_${label}`, `${label} framing is malformed`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`MALFORMED_${label}`, `${label} is not JSON`); }
  if (!bytes.equals(canonicalBytes(value))) fail(`MALFORMED_${label}`, `${label} is not canonical JSON`);
  return value;
}

async function writeExclusive(target, value) {
  const handle = await open(target, "wx");
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); } finally { await handle.close(); }
}

async function assertPhysicalDirectory(target, label) {
  let stat;
  try { stat = await lstat(target); } catch { fail("TREATMENT_PROOF_LEDGER_MISMATCH", `${label} is missing`); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(await realpath(target)) !== normalized(target)) {
    fail("TREATMENT_PROOF_LEDGER_MISMATCH", `${label} is linked, aliased, or not a physical directory`);
  }
  return target;
}

async function assertLedgerLayout(root) {
  const entries = (await readdir(root)).sort();
  const allowed = new Set([APPROVAL_FILE, META_FILE, RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR, ACTIVE_FILE, LOCK_FILE]);
  if (!entries.includes(APPROVAL_FILE) || !entries.includes(META_FILE) || entries.some((item) => !allowed.has(item))) {
    fail("TREATMENT_PROOF_UNKNOWN_RESIDUE", "Treatment-proof ledger contains missing or unknown state");
  }
  for (const directory of [RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR]) {
    const target = await assertPhysicalDirectory(path.join(root, directory), directory);
    for (const entry of await readdir(target)) {
      if (directory === DOCKER_CONFIG_DIR || !/^[0-9a-f]{64}\.json$/u.test(entry)) fail("TREATMENT_PROOF_UNKNOWN_RESIDUE", `${directory} contains unknown residue`);
      await readCanonical(path.join(target, entry), `TREATMENT_PROOF_${directory.toUpperCase()}_ENTRY`);
    }
  }
}

async function acquireLock(root) {
  try { return await open(path.join(root, LOCK_FILE), "wx"); }
  catch (error) { if (error?.code === "EEXIST") fail("TREATMENT_PROOF_CONCURRENT", "Another treatment-proof operation owns this ledger"); throw error; }
}

async function releaseLock(root, lock) {
  await lock.close();
  await rm(path.join(root, LOCK_FILE), { force: true });
}

export async function prepareRc7GateCTreatmentProofFreeze(freezeRoot, ledgerRoot, resultsRoot, rlmRoot, conformanceRlmRoot, conformanceLedgerRoot) {
  const [output, ledger, results, rlm, conformanceRlm, conformanceLedger] = await Promise.all([
    assertRoot(freezeRoot, true), assertRoot(ledgerRoot, true), assertRoot(resultsRoot, true), assertRoot(rlmRoot, true),
    assertRoot(conformanceRlmRoot), assertRoot(conformanceLedgerRoot),
  ]);
  assertDisjointRoots([output.root, ledger.root, results.root, rlm.root, conformanceRlm.root, conformanceLedger.root]);
  const value = validateFreeze(await buildRc7GateCTreatmentProofFreeze(
    ledger.root, results.root, rlm.root, conformanceRlm.root, conformanceLedger.root,
  ));
  const target = path.join(output.root, RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME);
  await writeExclusive(target, value);
  return {
    root: output.root,
    package_path: target,
    byte_count: canonicalBytes(value).byteLength,
    closure_sha256: value.closure_sha256,
    freeze_sha256: value.freeze_sha256,
    future_activation_sha256: value.future_activation_sha256,
    exact_approval_text: value.exact_approval_text,
  };
}

function approvalRecord(freeze) {
  return withDigest({
    schema_version: "rc7-gate-c-treatment-proof-approval-v1",
    state: "operator-approved-one-treatment-only",
    policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
    closure_sha256: freeze.closure_sha256,
    freeze_sha256: freeze.freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    approval_text_sha256: freeze.approval_text_sha256,
    exact_approval_text: freeze.exact_approval_text,
    ledger_root_identity: freeze.closure.roots.ledger,
    results_root_identity: freeze.closure.roots.results,
    rlm_root_identity: freeze.closure.roots.rlm,
    provider_free_rlm_conformance: freeze.closure.provider_free_rlm_conformance,
    authority_scope: "one-nonmatrix-lab01-top-level-four-children-one-contained-rlm-no-replay",
  }, "approval_sha256");
}

export async function recordRc7GateCTreatmentProofApproval(ledgerRoot, input) {
  exactKeys(input, ["conformance_ledger_root", "conformance_rlm_root", "exact_approval_text", "freeze_sha256", "future_activation_sha256", "results_root", "rlm_root"], "treatment-proof approval input");
  const [ledger, results, rlm, conformanceRlm, conformanceLedger] = await Promise.all([
    assertRoot(ledgerRoot, true), assertRoot(input?.results_root, true), assertRoot(input?.rlm_root, true),
    assertRoot(input?.conformance_rlm_root), assertRoot(input?.conformance_ledger_root),
  ]);
  assertDisjointRoots([ledger.root, results.root, rlm.root, conformanceRlm.root, conformanceLedger.root]);
  const freeze = validateFreeze(await buildRc7GateCTreatmentProofFreeze(
    ledger.root, results.root, rlm.root, conformanceRlm.root, conformanceLedger.root,
  ));
  if (input.exact_approval_text !== freeze.exact_approval_text || input.freeze_sha256 !== freeze.freeze_sha256
    || input.future_activation_sha256 !== freeze.future_activation_sha256) fail("TREATMENT_PROOF_APPROVAL_REQUIRED", "Approval must reproduce the exact current text and digests");
  const record = approvalRecord(freeze);
  await writeExclusive(path.join(ledger.root, APPROVAL_FILE), record);
  return { ledger_root: ledger.root, results_root: results.root, rlm_root: rlm.root, approval_sha256: record.approval_sha256, future_activation_sha256: freeze.future_activation_sha256 };
}

async function approvedContext(ledgerRoot, requireInitialized = true) {
  const ledger = await assertRoot(ledgerRoot);
  const approval = await readCanonical(path.join(ledger.root, APPROVAL_FILE), "TREATMENT_PROOF_APPROVAL");
  const resultsRoot = approval?.results_root_identity?.normalized_physical_root;
  const rlmRoot = approval?.rlm_root_identity?.normalized_physical_root;
  const conformanceRlmRoot = approval?.provider_free_rlm_conformance?.rlm_root_identity?.normalized_physical_root;
  const conformanceLedgerRoot = approval?.provider_free_rlm_conformance?.ledger_root_identity?.normalized_physical_root;
  const freeze = validateFreeze(await buildRc7GateCTreatmentProofFreeze(
    ledger.root, resultsRoot, rlmRoot, conformanceRlmRoot, conformanceLedgerRoot,
  ));
  const expected = approvalRecord(freeze);
  if (canonicalJsonV1(approval) !== canonicalJsonV1(expected)) fail("TREATMENT_PROOF_APPROVAL_REQUIRED", "Durable treatment-proof approval no longer matches its physical roots and execution closure");
  if (requireInitialized) {
    await assertLedgerLayout(ledger.root);
    const meta = await readCanonical(path.join(ledger.root, META_FILE), "TREATMENT_PROOF_LEDGER");
    if (meta.activation_sha256 !== freeze.future_activation_sha256 || meta.approval_sha256 !== approval.approval_sha256
      || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Treatment-proof ledger metadata mismatched");
  }
  return { ledger: ledger.root, results_root: resultsRoot, rlm_root: rlmRoot, approval, freeze };
}

export async function buildRc7GateCTreatmentProofFreezeForApprovedLedger(ledgerRoot) {
  return (await approvedContext(ledgerRoot, false)).freeze;
}

export async function initializeRc7GateCTreatmentProofLedger(ledgerRoot) {
  const context = await approvedContext(ledgerRoot, false);
  let lock;
  try {
    lock = await acquireLock(context.ledger);
    const entries = (await readdir(context.ledger)).filter((item) => item !== LOCK_FILE).sort();
    if (canonicalJsonV1(entries) !== canonicalJsonV1([APPROVAL_FILE])) fail("TREATMENT_PROOF_UNKNOWN_RESIDUE", "Fresh proof ledger may contain only its exact approval");
    for (const directory of [RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR]) await mkdir(path.join(context.ledger, directory));
    const meta = withDigest({
      schema_version: "rc7-gate-c-treatment-proof-ledger-v1",
      state: "initialized-one-treatment-no-replay",
      policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
      activation_sha256: context.freeze.future_activation_sha256,
      approval_sha256: context.approval.approval_sha256,
      run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
      maximum_reservations: 6,
      logical_requests: 5,
      global_transient_replacements: 1,
      top_level_reservations: 1,
      child_reservations: 4,
      generation_https_post_ceiling: 6,
      oauth_refresh_https_post_ceiling: 6,
      total_https_post_ceiling: 12,
      hard_output_plus_reasoning_authority_total: 768_000,
      global_concurrency: 1,
      retries: 0,
    }, "ledger_sha256");
    await writeExclusive(path.join(context.ledger, META_FILE), meta);
    return { root: context.ledger, activation_sha256: context.freeze.future_activation_sha256, ledger_sha256: meta.ledger_sha256, provider_reachable: true };
  } finally { if (lock) await releaseLock(context.ledger, lock); }
}

async function fixedRequest(input) {
  if (!input || input.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID || !["top-level", "recursive-child"].includes(input.request_kind)) {
    fail("TREATMENT_PROOF_REQUEST_DENIED", "Only the exact frozen treatment-proof request family is allowed");
  }
  if (input.request_kind === "top-level") {
    if (input.child_sequence !== 0 || input.child_question !== null || input.excerpt_locator !== null) fail("TREATMENT_PROOF_REQUEST_DENIED", "Top-level treatment-proof request widened");
  } else {
    const specs = await buildRc7GateCRlmChildSpecs("LAB-01");
    const spec = specs[input.child_sequence - 1];
    if (!spec || input.child_question !== spec.child_question || canonicalJsonV1(input.excerpt_locator) !== canonicalJsonV1(spec.excerpt_locator)) {
      fail("TREATMENT_PROOF_REQUEST_DENIED", "Recursive child differs from its exact registered sequence");
    }
  }
  return buildRc7GateCRequestIntent(input);
}

export async function buildRc7GateCTreatmentProofRequest(input) {
  return fixedRequest(input);
}

function expectedClosure(context) {
  const execution = context.freeze.closure.execution_closure;
  return {
    activation_sha256: context.freeze.future_activation_sha256,
    broker_package_sha256: execution.broker_package_sha256,
    preregistration_sha256: context.freeze.closure.preregistration_sha256,
    scorer_contract_sha256: execution.scorer_contract_sha256,
    worker_package_sha256: execution.worker_package_sha256,
  };
}

function permitFor(intent, context, reservationPlan) {
  const closure = expectedClosure(context);
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-permit-v2",
    activation_sha256: closure.activation_sha256,
    preregistration_sha256: closure.preregistration_sha256,
    broker_package_sha256: closure.broker_package_sha256,
    worker_package_sha256: closure.worker_package_sha256,
    scorer_contract_sha256: closure.scorer_contract_sha256,
    intent_sha256: intent.intent_sha256,
    run_id: intent.run_id,
    request_kind: intent.request_kind,
    child_sequence: intent.child_sequence,
    semantic_request_sha256: intent.semantic_request_sha256,
    semantic_request_byte_count: intent.semantic_request_byte_count,
    dispatch_nonce: sha256V1(canonicalJsonV1({
      activation_sha256: closure.activation_sha256,
      intent_sha256: intent.intent_sha256,
      reservation_ordinal: reservationPlan.reservation_ordinal,
      replacement_ordinal: reservationPlan.replacement_ordinal,
    })),
    state: "reserved-provider-reachable-once",
  }, "permit_sha256");
}

function logicalRequestShape(logicalIndex) {
  if (!Number.isSafeInteger(logicalIndex) || logicalIndex < 0 || logicalIndex > 4) {
    fail("TREATMENT_PROOF_BUDGET_EXHAUSTED", "All five logical proof requests are complete");
  }
  return logicalIndex === 0
    ? { request_kind: "top-level", child_sequence: 0 }
    : { request_kind: "recursive-child", child_sequence: logicalIndex };
}

async function ledgerHistory(context) {
  const reservationNames = (await readdir(path.join(context.ledger, RESERVATIONS_DIR))).sort();
  const terminalNames = new Set((await readdir(path.join(context.ledger, TERMINALS_DIR))).sort());
  if (reservationNames.length !== terminalNames.size) {
    fail("TREATMENT_PROOF_ORDER_MISMATCH", "Every earlier proof reservation must be terminal before another can be consumed");
  }
  const history = [];
  for (const reservationName of reservationNames) {
    const retainedDispatch = await readCanonical(path.join(context.ledger, RESERVATIONS_DIR, reservationName), "TREATMENT_PROOF_PRIOR_RESERVATION");
    exactKeys(retainedDispatch, [
      "activation_sha256", "arm", "case_id", "child_sequence", "dispatch_nonce", "dispatch_sha256", "intent_sha256",
      "permit_sha256", "replacement_ordinal", "request_kind", "reservation_key", "reservation_ordinal", "run_id",
      "schema_version", "selected_route", "semantic_request_sha256", "state",
    ], "retained treatment-proof dispatch");
    const request = await exactRequestForDispatch(retainedDispatch);
    const reservationPlan = {
      reservation_ordinal: retainedDispatch.reservation_ordinal,
      replacement_ordinal: retainedDispatch.replacement_ordinal,
    };
    const permit = permitFor(request.intent, context, reservationPlan);
    const expectedDispatch = withDigest({
      schema_version: "rc7-gate-c-dispatch-checkpoint-v2",
      activation_sha256: context.freeze.future_activation_sha256,
      intent_sha256: request.intent.intent_sha256,
      permit_sha256: permit.permit_sha256,
      dispatch_nonce: permit.dispatch_nonce,
      run_id: request.intent.run_id,
      case_id: request.intent.case_id,
      arm: request.intent.arm,
      selected_route: request.intent.selected_route,
      request_kind: request.intent.request_kind,
      child_sequence: request.intent.child_sequence,
      semantic_request_sha256: request.intent.semantic_request_sha256,
      reservation_key: reservationKey(request.intent, reservationPlan, context.freeze.future_activation_sha256),
      reservation_ordinal: reservationPlan.reservation_ordinal,
      replacement_ordinal: reservationPlan.replacement_ordinal,
      state: "consumed-provider-reachable-handoff-started",
    }, "dispatch_sha256");
    if (canonicalJsonV1(retainedDispatch) !== canonicalJsonV1(expectedDispatch)) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Retained proof dispatch identity or self-digest mismatched");
    }
    const dispatch = expectedDispatch;
    const terminalName = `${dispatch.reservation_key}.json`;
    if (reservationName !== terminalName || !terminalNames.has(terminalName)) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Proof reservation and terminal identities diverged");
    const retainedTerminal = await readCanonical(path.join(context.ledger, TERMINALS_DIR, terminalName), "TREATMENT_PROOF_PRIOR_TERMINAL");
    exactKeys(retainedTerminal, [
      "accounting", "activation_sha256", "child_sequence", "dispatch_sha256", "replay_permitted", "replacement_ordinal",
      "request_kind", "reservation_key", "run_id", "schema_version", "sealed_result", "state", "terminal_sha256",
    ], "retained treatment-proof terminal");
    if (!['trusted-sealed', 'indeterminate-no-replay'].includes(retainedTerminal.state)) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Retained proof terminal state widened");
    }
    const sealedResult = retainedTerminal.state === "trusted-sealed"
      ? validateSealedResult(retainedTerminal.sealed_result, dispatch) : null;
    const accounting = retainedTerminal.state === "indeterminate-no-replay" && retainedTerminal.accounting !== null
      ? validateClosedFailureAccounting(retainedTerminal.accounting, dispatch.request_kind) : retainedTerminal.accounting;
    if (retainedTerminal.state === "trusted-sealed" && accounting === null) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "A retained trusted proof terminal lacks accounting");
    }
    if (retainedTerminal.state === "indeterminate-no-replay" && retainedTerminal.sealed_result !== null) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "A retained failed proof terminal claims a sealed result");
    }
    const terminal = withDigest({
      schema_version: "rc7-gate-c-treatment-proof-terminal-v2",
      state: retainedTerminal.state,
      activation_sha256: dispatch.activation_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      reservation_key: dispatch.reservation_key,
      run_id: dispatch.run_id,
      request_kind: dispatch.request_kind,
      child_sequence: dispatch.child_sequence,
      replacement_ordinal: dispatch.replacement_ordinal,
      sealed_result: sealedResult,
      accounting,
      replay_permitted: false,
    }, "terminal_sha256");
    if (canonicalJsonV1(retainedTerminal) !== canonicalJsonV1(terminal)) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Retained proof terminal identity or self-digest mismatched");
    }
    history.push({ dispatch, terminal });
  }
  history.sort((left, right) => left.dispatch.reservation_ordinal - right.dispatch.reservation_ordinal);
  history.forEach((entry, index) => {
    if (entry.dispatch.reservation_ordinal !== index + 1) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Proof reservation ordinals are not contiguous");
  });
  return history;
}

function planFromHistory(history) {
  let logicalIndex = 0;
  let replacementUsed = false;
  let awaitingReplacement = false;
  let stopped = false;
  for (const { dispatch, terminal } of history) {
    if (stopped || logicalIndex > 4) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Proof history continued after a closed terminal state");
    const expected = logicalRequestShape(logicalIndex);
    if (dispatch.request_kind !== expected.request_kind || dispatch.child_sequence !== expected.child_sequence) {
      fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Proof history changed logical request order");
    }
    if (awaitingReplacement) {
      if (replacementUsed || dispatch.replacement_ordinal !== 1) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Proof replacement identity widened or repeated");
      replacementUsed = true;
      awaitingReplacement = false;
    } else if (dispatch.replacement_ordinal !== 0) fail("TREATMENT_PROOF_LEDGER_MISMATCH", "A replacement appeared without a replaceable terminal");

    if (terminal.state === "trusted-sealed") logicalIndex += 1;
    else if (terminal.state === "indeterminate-no-replay" && terminal.accounting !== null
      && REPLACEABLE_FAILURE_CODES.has(terminal.accounting.failure_code) && !replacementUsed) awaitingReplacement = true;
    else stopped = true;
  }
  return {
    logical_index: logicalIndex,
    replacement_used: replacementUsed,
    awaiting_replacement: awaitingReplacement,
    stopped,
    complete: logicalIndex === 5,
  };
}

async function nextReservationPlan(context) {
  try { await lstat(path.join(context.ledger, ACTIVE_FILE)); fail("TREATMENT_PROOF_CONCURRENT", "A proof dispatch remains active"); }
  catch (error) { if (error instanceof Rc7GateCTreatmentProofError) throw error; if (error?.code !== "ENOENT") throw error; }
  const history = await ledgerHistory(context);
  const state = planFromHistory(history);
  if (state.complete) fail("TREATMENT_PROOF_BUDGET_EXHAUSTED", "All five logical proof requests are complete");
  if (state.stopped) fail("TREATMENT_PROOF_NO_REPLAY", "A nonreplaceable or second failed terminal stops the proof");
  if (history.length >= 6) fail("TREATMENT_PROOF_BUDGET_EXHAUSTED", "The five logical requests and one replacement are consumed");
  const expected = logicalRequestShape(state.logical_index);
  return {
    ...expected,
    reservation_ordinal: history.length + 1,
    replacement_ordinal: state.awaiting_replacement ? 1 : 0,
  };
}

export async function authorizeRc7GateCTreatmentProofDispatch(ledgerRoot, intent) {
  const context = await approvedContext(ledgerRoot);
  const expected = await exactRequestForIntent(intent);
  if (canonicalJsonV1(intent) !== canonicalJsonV1(expected.intent)) fail("TREATMENT_PROOF_REQUEST_DENIED", "Intent is not the exact broker-built proof request");
  const plan = await nextReservationPlan(context);
  if (intent.request_kind !== plan.request_kind || intent.child_sequence !== plan.child_sequence) fail("TREATMENT_PROOF_ORDER_MISMATCH", "Proof request does not match the next logical or replacement reservation");
  return permitFor(intent, context, plan);
}

async function exactRequestForIntent(intent) {
  const childSpec = intent?.request_kind === "recursive-child"
    ? (await buildRc7GateCRlmChildSpecs("LAB-01"))[intent?.child_sequence - 1]
    : null;
  return fixedRequest({
    run_id: intent?.run_id,
    request_kind: intent?.request_kind,
    child_sequence: intent?.child_sequence,
    child_question: childSpec?.child_question ?? null,
    excerpt_locator: childSpec?.excerpt_locator ?? null,
  });
}

function reservationKey(intent, reservationPlan, activationSha256) {
  return sha256V1(canonicalJsonV1({
    activation_sha256: activationSha256,
    run_id: intent.run_id,
    request_kind: intent.request_kind,
    child_sequence: intent.child_sequence,
    reservation_ordinal: reservationPlan.reservation_ordinal,
    replacement_ordinal: reservationPlan.replacement_ordinal,
  }));
}

export async function consumeRc7GateCTreatmentProofReservation(ledgerRoot, { intent, permit }) {
  exactKeys({ intent, permit }, ["intent", "permit"], "treatment-proof reservation input");
  const context = await approvedContext(ledgerRoot);
  let lock;
  try {
    lock = await acquireLock(context.ledger);
    const expectedRequest = await exactRequestForIntent(intent);
    if (canonicalJsonV1(intent) !== canonicalJsonV1(expectedRequest.intent)) fail("TREATMENT_PROOF_REQUEST_DENIED", "Reservation intent is not the exact broker-built proof request");
    const plan = await nextReservationPlan(context);
    if (intent.request_kind !== plan.request_kind || intent.child_sequence !== plan.child_sequence) fail("TREATMENT_PROOF_ORDER_MISMATCH", "Proof reservations must follow the five logical requests or their single replacement");
    if (canonicalJsonV1(permit) !== canonicalJsonV1(permitFor(intent, context, plan))) fail("TREATMENT_PROOF_PERMIT_MISMATCH", "Proof permit differs from current durable approval and replacement state");
    const key = reservationKey(intent, plan, context.freeze.future_activation_sha256);
    const dispatch = withDigest({
      schema_version: "rc7-gate-c-dispatch-checkpoint-v2",
      activation_sha256: context.freeze.future_activation_sha256,
      intent_sha256: intent.intent_sha256,
      permit_sha256: permit.permit_sha256,
      dispatch_nonce: permit.dispatch_nonce,
      run_id: intent.run_id,
      case_id: intent.case_id,
      arm: intent.arm,
      selected_route: intent.selected_route,
      request_kind: intent.request_kind,
      child_sequence: intent.child_sequence,
      semantic_request_sha256: intent.semantic_request_sha256,
      reservation_key: key,
      reservation_ordinal: plan.reservation_ordinal,
      replacement_ordinal: plan.replacement_ordinal,
      state: "consumed-provider-reachable-handoff-started",
    }, "dispatch_sha256");
    await writeExclusive(path.join(context.ledger, RESERVATIONS_DIR, `${key}.json`), dispatch);
    await writeExclusive(path.join(context.ledger, ACTIVE_FILE), dispatch);
    return dispatch;
  } finally { if (lock) await releaseLock(context.ledger, lock); }
}

export async function sealRc7GateCTreatmentProofRequest(ledgerRoot, input) {
  exactKeys(input, ["dispatch_sha256", "request"], "treatment-proof sealed request input");
  exactKeys(input.request, ["intent", "semantic_request", "semantic_request_bytes"], "treatment-proof broker request");
  const context = await approvedContext(ledgerRoot);
  const dispatch = await readCanonical(path.join(context.ledger, ACTIVE_FILE), "TREATMENT_PROOF_ACTIVE_DISPATCH");
  const expected = await fixedRequest({
    run_id: input.request?.intent?.run_id,
    request_kind: input.request?.intent?.request_kind,
    child_sequence: input.request?.intent?.child_sequence,
    child_question: input.request?.intent?.request_kind === "recursive-child" ? (await buildRc7GateCRlmChildSpecs("LAB-01"))[input.request.intent.child_sequence - 1]?.child_question : null,
    excerpt_locator: input.request?.intent?.request_kind === "recursive-child" ? (await buildRc7GateCRlmChildSpecs("LAB-01"))[input.request.intent.child_sequence - 1]?.excerpt_locator : null,
  });
  if (input.dispatch_sha256 !== dispatch.dispatch_sha256 || canonicalJsonV1(input.request.intent) !== canonicalJsonV1(expected.intent)
    || !Buffer.isBuffer(input.request.semantic_request_bytes) || !input.request.semantic_request_bytes.equals(expected.semantic_request_bytes)
    || canonicalJsonV1(input.request.semantic_request) !== canonicalJsonV1(expected.semantic_request)) fail("TREATMENT_PROOF_SEALED_REQUEST_MISMATCH", "Only the exact active proof request can be sealed");
  const closure = expectedClosure(context);
  const value = withDigest({
    schema_version: "rc7-gate-c-sealed-worker-request-v1",
    ...closure,
    intent: expected.intent,
    permit: permitFor(expected.intent, context, {
      reservation_ordinal: dispatch.reservation_ordinal,
      replacement_ordinal: dispatch.replacement_ordinal,
    }),
    semantic_request: expected.semantic_request,
    semantic_request_sha256: expected.intent.semantic_request_sha256,
    semantic_request_byte_count: expected.intent.semantic_request_byte_count,
  }, "sealed_request_sha256");
  validateRc7GateCSealedWorkerRequest(value, closure, "reserved-provider-reachable-once");
  return value;
}

function validateGateBReference(value, dispatch) {
  exactKeys(value, ["activation_sha256", "attestation_sha256", "container_id", "dispatch_sha256", "intent_sha256", "schema_version", "state"], "treatment-proof Gate B reference");
  if (value.schema_version !== "rc7-gate-c-gate-b-live-attestation-v3" || value.activation_sha256 !== dispatch.activation_sha256
    || value.intent_sha256 !== dispatch.intent_sha256 || value.dispatch_sha256 !== dispatch.dispatch_sha256
    || value.attestation_sha256 !== sha256V1(canonicalJsonV1(projection(value, "attestation_sha256")))) fail("TREATMENT_PROOF_GATE_B_MISMATCH", "Gate B reference does not close over the active proof dispatch");
  const child = dispatch.request_kind === "recursive-child";
  if ((!child && (value.state !== "not-applicable-top-level-host-provider" || value.container_id !== null))
    || (child && (value.state !== "broker-inspect-live-rlm-container" || !HASH.test(value.container_id ?? "")))) fail("TREATMENT_PROOF_GATE_B_MISMATCH", "Gate B reference widened the exact route phase");
  return value;
}

function noContainerEvidence(dispatch) {
  return {
    schema_version: "rc7-gate-c-broker-derived-gate-b-evidence-v1",
    state: "not-applicable-top-level-host-provider",
    selected_route: "rc-rlm",
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    container_id: null,
    image_id: null,
    docker_executable_sha256: null,
    outer_seccomp_inspect_sha256: null,
    network: "not-applicable-no-container",
    direct_container_provider_access: "not-applicable-no-container",
    input_mount_sha256: null,
    launcher_parent_intent_sha256: null,
    launcher_parent_dispatch_sha256: null,
    launcher_parent_semantic_request_sha256: null,
    phase_two_tsync_proven: false,
  };
}

async function trustedParent(context) {
  const request = await exactTopRequest();
  const trusted = [];
  for (const name of await readdir(path.join(context.ledger, RESERVATIONS_DIR))) {
    const dispatch = await readCanonical(path.join(context.ledger, RESERVATIONS_DIR, name), "TREATMENT_PROOF_PARENT_RESERVATION");
    if (dispatch.request_kind !== "top-level") continue;
    let terminal;
    try { terminal = await readCanonical(path.join(context.ledger, TERMINALS_DIR, name), "TREATMENT_PROOF_PARENT_TERMINAL"); }
    catch (error) { if (String(error?.code ?? "").startsWith("MISSING_")) continue; throw error; }
    if (terminal.state === "trusted-sealed" && terminal.dispatch_sha256 === dispatch.dispatch_sha256) trusted.push({ dispatch, terminal });
  }
  if (trusted.length !== 1) {
    fail("TREATMENT_PROOF_PARENT_NOT_TRUSTED", "Child authority requires the exact trusted top-level proof result");
  }
  return { ...trusted[0], request };
}

export async function preflightRc7GateCTreatmentProofLiveDispatch(input) {
  exactKeys(input, ["dispatch_sha256", "gate_b_attestation", "handoff_nonce", "ledger_root", "sealed_request"], "treatment-proof live preflight input");
  const context = await approvedContext(input?.ledger_root);
  if (!HASH.test(input?.handoff_nonce ?? "")) fail("TREATMENT_PROOF_HANDOFF_MISMATCH", "Treatment proof requires one fresh host handoff nonce");
  let lock;
  try {
    lock = await acquireLock(context.ledger);
    const dispatch = await readCanonical(path.join(context.ledger, ACTIVE_FILE), "TREATMENT_PROOF_ACTIVE_DISPATCH");
    if (dispatch.dispatch_sha256 !== input.dispatch_sha256) fail("TREATMENT_PROOF_DISPATCH_MISMATCH", "Host preflight differs from the active proof dispatch");
    const closure = expectedClosure(context);
    const sealed = validateRc7GateCSealedWorkerRequest(input.sealed_request, closure, "reserved-provider-reachable-once");
    if (sealed.intent.intent_sha256 !== dispatch.intent_sha256 || sealed.permit.permit_sha256 !== dispatch.permit_sha256) fail("TREATMENT_PROOF_SEALED_REQUEST_MISMATCH", "Proof sealed request differs from its durable dispatch");
    const expectedRequest = await exactRequestForDispatch(dispatch);
    if (canonicalJsonV1(sealed.intent) !== canonicalJsonV1(expectedRequest.intent)
      || canonicalJsonV1(sealed.semantic.value) !== canonicalJsonV1(expectedRequest.semantic_request)
      || sealed.semantic.sha256 !== expectedRequest.intent.semantic_request_sha256) {
      fail("TREATMENT_PROOF_SEALED_REQUEST_MISMATCH", "Proof sealed request is not the exact fixed route-specific request");
    }
    const reference = validateGateBReference(input.gate_b_attestation, dispatch);
    let gateB;
    if (dispatch.request_kind === "top-level") gateB = noContainerEvidence(dispatch);
    else {
      const parent = await trustedParent(context);
      gateB = await inspectRc7GateCTreatmentProofContainer({
        ledger_root: context.ledger,
        container_id: reference.container_id,
        expected: {
          activation_sha256: dispatch.activation_sha256,
          arm: dispatch.arm,
          case_id: dispatch.case_id,
          container_id: reference.container_id,
          dispatch_sha256: dispatch.dispatch_sha256,
          intent_sha256: dispatch.intent_sha256,
          launcher_parent: {
            activation_sha256: parent.dispatch.activation_sha256,
            run_id: parent.dispatch.run_id,
            case_id: parent.dispatch.case_id,
            arm: parent.dispatch.arm,
            selected_route: "rc-rlm",
            intent_sha256: parent.dispatch.intent_sha256,
            dispatch_sha256: parent.dispatch.dispatch_sha256,
            semantic_request_sha256: parent.dispatch.semantic_request_sha256,
            semantic_request: parent.request.semantic_request,
          },
          request_kind: dispatch.request_kind,
          run_id: dispatch.run_id,
          selected_route: dispatch.selected_route,
          semantic_request: sealed.semantic.value,
          semantic_request_sha256: sealed.semantic.sha256,
        },
      });
    }
    const durable = withDigest({
      schema_version: "rc7-gate-c-durable-provider-handoff-v1",
      state: "preflight-consumed-provider-reachability-committed",
      activation_sha256: dispatch.activation_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      reservation_key: dispatch.reservation_key,
      handoff_nonce: input.handoff_nonce,
      sealed_request_sha256: sealed.value.sealed_request_sha256,
      gate_b_attestation_sha256: reference.attestation_sha256,
    }, "durable_handoff_sha256");
    await writeExclusive(path.join(context.ledger, HANDOFFS_DIR, `${dispatch.reservation_key}.json`), durable);
    return {
      sealed: sealed.value,
      dispatch,
      durable_handoff: durable,
      expected_closure: closure,
      wire_contract: {
        schema_version: "rc7-gate-c-exact-wire-contract-v1",
        provider_endpoint: "https://chatgpt.com/backend-api/codex/responses",
        refresh_endpoint: "https://auth.openai.com/oauth/token",
        provider: sealed.intent.provider,
        adapter: sealed.intent.adapter,
        adapter_revision: sealed.intent.adapter_revision,
        model: sealed.intent.model,
        configured_snapshot: sealed.intent.configured_snapshot,
        reasoning: sealed.intent.reasoning,
        max_output_plus_reasoning_tokens: sealed.intent.max_output_plus_reasoning_tokens,
        provider_active_timeout_seconds: sealed.intent.provider_active_timeout_seconds,
        automatic_retries: 0,
        generation_https_posts: 1,
        oauth_refresh_https_posts: 1,
        all_other_network: "denied",
      },
      gate_b: gateB,
    };
  } finally { if (lock) await releaseLock(context.ledger, lock); }
}

function validateSealedResult(value, dispatch) {
  exactKeys(value, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce",
    "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "sealed_result_sha256",
  ], "treatment-proof sealed result");
  if (value.schema_version !== "rc7-gate-c-sealed-worker-result-v1" || value.state !== "trusted-sealed"
    || value.activation_sha256 !== dispatch.activation_sha256 || value.intent_sha256 !== dispatch.intent_sha256
    || value.permit_sha256 !== dispatch.permit_sha256 || value.dispatch_nonce !== dispatch.dispatch_nonce
    || value.sealed_result_sha256 !== sha256V1(canonicalJsonV1(projection(value, "sealed_result_sha256")))) fail("TREATMENT_PROOF_RESULT_MISMATCH", "Sealed result differs from its proof dispatch");
  return value;
}

function expectedClosedFailureCode(value) {
  if (value.base_error_code === "MALFORMED_STREAM") {
    if (value.terminal_kind !== null || value.provider_failure_code !== null || value.integration_failure_phase !== null
      || !RC7_GATE_C_STREAM_FAILURE_PHASES.includes(value.stream_failure_phase)) return null;
    return `MALFORMED_STREAM_${value.stream_failure_phase}`;
  }
  if (value.base_error_code === "PROVIDER_TERMINAL_REJECTED") {
    if (value.stream_failure_phase !== null) return null;
    if (value.terminal_kind === "max-tokens" && value.provider_failure_code === null && value.integration_failure_phase === null) return "PROVIDER_TERMINAL_MAX_TOKENS";
    if (value.terminal_kind === "tool-calls" && value.provider_failure_code === null && value.integration_failure_phase === null) return "PROVIDER_TERMINAL_TOOL_CALLS";
    if (value.terminal_kind === "aborted" && value.provider_failure_code === "ABORTED" && value.integration_failure_phase === null) return "PROVIDER_TERMINAL_ABORTED";
    if (value.terminal_kind === "error" && PROVIDER_TERMINAL_FAILURE_CODES.has(value.provider_failure_code)) {
      if (value.provider_failure_code === "INTEGRATION") {
        const expectedPhase = classifyRc7GateCIntegrationFailurePhase(value.observations);
        if (!RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(value.integration_failure_phase) || value.integration_failure_phase !== expectedPhase) return null;
        return `PROVIDER_TERMINAL_ERROR_INTEGRATION_${value.integration_failure_phase}`;
      }
      if (value.integration_failure_phase === null) return `PROVIDER_TERMINAL_ERROR_${value.provider_failure_code}`;
    }
    return null;
  }
  if (value.terminal_kind !== null || value.provider_failure_code !== null || value.integration_failure_phase !== null || value.stream_failure_phase !== null) return null;
  return value.base_error_code;
}

function validateClosedFailureAccounting(value, requestKind) {
  exactKeys(value, [
    "base_error_code", "failure_code", "integration_failure_phase", "observations", "provider_failure_code",
    "schema_version", "stream_failure_phase", "terminal_kind",
  ], "closed treatment-proof failure accounting");
  exactKeys(value.observations, ["automatic_retry_count", "provider_active_milliseconds", "provider_posts", "refresh_posts"], "closed treatment-proof failure observations");
  const observations = value.observations;
  const expected = expectedClosedFailureCode(value);
  if (value.schema_version !== "rc7-gate-c-closed-failure-accounting-v1"
    || !ERROR_CODE.test(value.base_error_code ?? "") || !ERROR_CODE.test(value.failure_code ?? "") || value.failure_code !== expected
    || ![0, 1].includes(observations.provider_posts) || ![0, 1].includes(observations.refresh_posts)
    || observations.automatic_retry_count !== 0 || !Number.isSafeInteger(observations.provider_active_milliseconds)
    || observations.provider_active_milliseconds < 0
    || observations.provider_active_milliseconds > (requestKind === "recursive-child" ? 120_000 : 300_000)) {
    fail("TREATMENT_PROOF_RESULT_MISMATCH", "Closed treatment-proof failure accounting widened or mismatched");
  }
  return value;
}

async function exactRequestForDispatch(dispatch) {
  return exactRequestForIntent(dispatch);
}

export async function closeRc7GateCTreatmentProofReservation(ledgerRoot, dispatch, outcome) {
  exactKeys(outcome, ["accounting", "sealed_result", "state"], "treatment-proof terminal input");
  const context = await approvedContext(ledgerRoot);
  let lock;
  try {
    lock = await acquireLock(context.ledger);
    const active = await readCanonical(path.join(context.ledger, ACTIVE_FILE), "TREATMENT_PROOF_ACTIVE_DISPATCH");
    if (canonicalJsonV1(active) !== canonicalJsonV1(dispatch)) fail("TREATMENT_PROOF_DISPATCH_MISMATCH", "Only the exact active proof dispatch can close");
    if (!outcome || !["trusted-sealed", "indeterminate-no-replay"].includes(outcome.state)) fail("TREATMENT_PROOF_RESULT_MISMATCH", "Proof terminal state is not closed");
    const sealed = outcome.state === "trusted-sealed" ? validateSealedResult(outcome.sealed_result, dispatch) : null;
    const failureAccounting = outcome.state === "indeterminate-no-replay" && outcome.accounting !== null
      ? validateClosedFailureAccounting(outcome.accounting, dispatch.request_kind) : null;
    if (outcome.state === "trusted-sealed" && outcome.accounting === null) fail("TREATMENT_PROOF_RESULT_MISMATCH", "A trusted proof terminal requires exact accounting");
    if (outcome.state === "trusted-sealed" || failureAccounting !== null) {
      const handoff = await readCanonical(path.join(context.ledger, HANDOFFS_DIR, `${dispatch.reservation_key}.json`), "TREATMENT_PROOF_DURABLE_HANDOFF");
      const request = await exactRequestForDispatch(dispatch);
      const expectedSealed = withDigest({
        schema_version: "rc7-gate-c-sealed-worker-request-v1",
        ...expectedClosure(context),
        intent: request.intent,
        permit: permitFor(request.intent, context, {
          reservation_ordinal: dispatch.reservation_ordinal,
          replacement_ordinal: dispatch.replacement_ordinal,
        }),
        semantic_request: request.semantic_request,
        semantic_request_sha256: request.intent.semantic_request_sha256,
        semantic_request_byte_count: request.intent.semantic_request_byte_count,
      }, "sealed_request_sha256");
      if (handoff.dispatch_sha256 !== dispatch.dispatch_sha256 || handoff.activation_sha256 !== dispatch.activation_sha256
        || handoff.sealed_request_sha256 !== expectedSealed.sealed_request_sha256) fail("TREATMENT_PROOF_HANDOFF_MISMATCH", "Trusted proof terminal requires its exact durable provider handoff");
    }
    const terminal = withDigest({
      schema_version: "rc7-gate-c-treatment-proof-terminal-v2",
      state: outcome.state,
      activation_sha256: dispatch.activation_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      reservation_key: dispatch.reservation_key,
      run_id: dispatch.run_id,
      request_kind: dispatch.request_kind,
      child_sequence: dispatch.child_sequence,
      replacement_ordinal: dispatch.replacement_ordinal,
      sealed_result: sealed,
      accounting: outcome.state === "trusted-sealed" ? outcome.accounting : failureAccounting,
      replay_permitted: false,
    }, "terminal_sha256");
    await writeExclusive(path.join(context.ledger, TERMINALS_DIR, `${dispatch.reservation_key}.json`), terminal);
    await rm(path.join(context.ledger, ACTIVE_FILE));
    return terminal;
  } finally { if (lock) await releaseLock(context.ledger, lock); }
}

export async function inspectRc7GateCTreatmentProofLedger(ledgerRoot) {
  const context = await approvedContext(ledgerRoot);
  const reservations = (await readdir(path.join(context.ledger, RESERVATIONS_DIR))).sort();
  const terminals = (await readdir(path.join(context.ledger, TERMINALS_DIR))).sort();
  const handoffs = (await readdir(path.join(context.ledger, HANDOFFS_DIR))).sort();
  let active = false;
  try { await lstat(path.join(context.ledger, ACTIVE_FILE)); active = true; } catch (error) { if (error?.code !== "ENOENT") throw error; }
  let plan = null;
  if (!active && reservations.length === terminals.length) plan = planFromHistory(await ledgerHistory(context));
  return {
    state: active ? "active-indeterminate-no-replay"
      : plan?.complete ? "complete-logical-treatment"
        : plan?.awaiting_replacement ? "replacement-available"
          : plan?.stopped ? "stopped-no-replay" : "prepared-or-partial",
    activation_sha256: context.freeze.future_activation_sha256,
    reservations: reservations.length,
    terminals: terminals.length,
    durable_handoffs: handoffs.length,
    replacement_reservations: !active ? (await Promise.all(reservations.map((name) => readCanonical(path.join(context.ledger, RESERVATIONS_DIR, name), "TREATMENT_PROOF_RESERVATION_INSPECTION"))))
      .filter((item) => item.replacement_ordinal === 1).length : null,
    active,
    replay_permitted: false,
  };
}

export async function recoverRc7GateCTreatmentProofLedger(ledgerRoot) {
  const context = await approvedContext(ledgerRoot);
  let lock;
  try {
    lock = await acquireLock(context.ledger);
    let active = null;
    try { active = await readCanonical(path.join(context.ledger, ACTIVE_FILE), "TREATMENT_PROOF_ACTIVE_DISPATCH"); }
    catch (error) { if (!String(error?.code ?? "").startsWith("MISSING_")) throw error; }
    if (active === null) return { changed: false, state: (await inspectRc7GateCTreatmentProofLedger(context.ledger)).state, replay_permitted: false };
    const terminalPath = path.join(context.ledger, TERMINALS_DIR, `${active.reservation_key}.json`);
    try { await lstat(terminalPath); fail("TREATMENT_PROOF_LEDGER_MISMATCH", "Active proof dispatch already has a terminal"); }
    catch (error) { if (error instanceof Rc7GateCTreatmentProofError) throw error; if (error?.code !== "ENOENT") throw error; }
    const terminal = withDigest({
      schema_version: "rc7-gate-c-treatment-proof-terminal-v2",
      state: "indeterminate-no-replay",
      activation_sha256: active.activation_sha256,
      dispatch_sha256: active.dispatch_sha256,
      reservation_key: active.reservation_key,
      run_id: active.run_id,
      request_kind: active.request_kind,
      child_sequence: active.child_sequence,
      replacement_ordinal: active.replacement_ordinal,
      sealed_result: null,
      accounting: null,
      replay_permitted: false,
    }, "terminal_sha256");
    await writeExclusive(terminalPath, terminal);
    await rm(path.join(context.ledger, ACTIVE_FILE));
    return { changed: true, state: "recovered-indeterminate-no-replay", terminal_sha256: terminal.terminal_sha256, replay_permitted: false };
  } finally { if (lock) await releaseLock(context.ledger, lock); }
}

export async function publishRc7GateCTreatmentProofSuccess(resultsRoot, ledgerRoot, execution) {
  const context = await approvedContext(ledgerRoot);
  const results = await assertRoot(resultsRoot, true);
  if (normalized(results.root) !== normalized(context.results_root)) fail("TREATMENT_PROOF_RESULTS_ROOT_MISMATCH", "Proof result root differs from approval");
  const ledger = await inspectRc7GateCTreatmentProofLedger(context.ledger);
  if (ledger.state !== "complete-logical-treatment" || execution?.state !== "trusted-rlm-attempt-complete"
    || execution.row?.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID || execution.children?.length !== 4
    || execution.rlm_invocation_count !== 1) fail("TREATMENT_PROOF_INCOMPLETE", "A successful proof requires one trusted top level, four trusted children, and one RLM result");
  const retainedRlm = await inspectRc7GateCRlmCompletedArtifact(context.rlm_root);
  if (execution.rlm?.final_artifact?.artifact_sha256 !== retainedRlm.final_artifact?.artifact_sha256
    || retainedRlm.final_artifact?.state !== "trusted-sealed-cleanup-verified"
    || retainedRlm.final_artifact?.cleanup_state !== "verified-no-labelled-container-residue"
    || retainedRlm.final_artifact?.cleanup_residue_entries !== 0) fail("TREATMENT_PROOF_CLEANUP_MISMATCH", "Contained proof artifact or cleanup evidence mismatched");
  const observations = [execution.top_level, ...execution.children];
  if (execution.top_level.observations.provider_active_milliseconds > 300_000
    || execution.children.some((item) => item.observations.provider_active_milliseconds > 120_000)) {
    fail("TREATMENT_PROOF_ACCOUNTING_MISMATCH", "Successful proof exceeded a route-specific provider-active ceiling");
  }
  const history = await ledgerHistory(context);
  const replacementFailures = history.filter((item) => item.dispatch.replacement_ordinal === 0
    && item.terminal.state === "indeterminate-no-replay" && item.terminal.accounting !== null);
  if (replacementFailures.length > 1 || replacementFailures.some((item) => !REPLACEABLE_FAILURE_CODES.has(item.terminal.accounting.failure_code))) {
    fail("TREATMENT_PROOF_ACCOUNTING_MISMATCH", "Completed proof contains an invalid replacement lineage");
  }
  const replacementFailure = replacementFailures[0]?.terminal ?? null;
  const accounting = observations.reduce((total, item) => ({
    generation_https_posts: total.generation_https_posts + item.observations.provider_posts,
    oauth_refresh_https_posts: total.oauth_refresh_https_posts + item.observations.oauth_refresh_posts,
    provider_active_milliseconds: total.provider_active_milliseconds + item.observations.provider_active_milliseconds,
    input_tokens: total.input_tokens + item.usage.input_tokens + item.usage.cache_read_tokens + item.usage.cache_write_tokens,
    output_plus_reasoning_tokens: total.output_plus_reasoning_tokens + item.usage.output_tokens + (item.usage.reasoning_tokens ?? 0),
  }), {
    generation_https_posts: replacementFailure?.accounting.observations.provider_posts ?? 0,
    oauth_refresh_https_posts: replacementFailure?.accounting.observations.refresh_posts ?? 0,
    provider_active_milliseconds: replacementFailure?.accounting.observations.provider_active_milliseconds ?? 0,
    input_tokens: replacementFailure === null ? 0 : 32_768,
    output_plus_reasoning_tokens: replacementFailure === null ? 0 : 8_192,
  });
  if (accounting.generation_https_posts < 5 || accounting.generation_https_posts > 6 || accounting.oauth_refresh_https_posts > 6
    || accounting.input_tokens > 196_608 || accounting.output_plus_reasoning_tokens > 768_000
    || accounting.provider_active_milliseconds > 1_080_000) fail("TREATMENT_PROOF_ACCOUNTING_MISMATCH", "Successful proof accounting exceeded or failed to consume the exact request and replacement shape");
  const result = withDigest({
    schema_version: "rc7-gate-c-treatment-proof-result-v1",
    state: "complete-nonmatrix-treatment-proof",
    policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
    activation_sha256: context.freeze.future_activation_sha256,
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
    case_id: "LAB-01",
    matrix_member: false,
    score_bearing: false,
    replay_permitted: false,
    top_level: {
      dispatch_sha256: execution.top_level.dispatch.dispatch_sha256,
      artifact: execution.top_level.artifact,
      usage: execution.top_level.usage,
      observations: execution.top_level.observations,
      sealed_result_sha256: execution.top_level.sealed_result.sealed_result_sha256,
      terminal_sha256: execution.top_level.terminal.terminal_sha256,
    },
    children: execution.children.map((item) => ({
      child_sequence: item.dispatch.child_sequence,
      dispatch_sha256: item.dispatch.dispatch_sha256,
      artifact: item.artifact,
      usage: item.usage,
      observations: item.observations,
      sealed_result_sha256: item.sealed_result.sealed_result_sha256,
      terminal_sha256: item.terminal.terminal_sha256,
    })),
    contained_rlm: {
      image_id: RC7_GATE_C_RLM_IMAGE_ID,
      final_artifact: retainedRlm.final_artifact,
      phase_two: retainedRlm.phase_two,
      container_result_sha256: retainedRlm.container_result.result_sha256,
    },
    combined_artifact: retainedRlm.final_artifact.route_output,
    combined_artifact_sha256: combinedArtifactSha256(retainedRlm.final_artifact.route_output),
    accounting,
    replacement: replacementFailure === null ? null : {
      terminal_sha256: replacementFailure.terminal_sha256,
      failure_code: replacementFailure.accounting.failure_code,
      observations: replacementFailure.accounting.observations,
      conservative_input_tokens: 32_768,
      conservative_output_plus_reasoning_target_tokens: 8_192,
      conservative_hard_output_plus_reasoning_authority_tokens: 128_000,
    },
    cleanup: { containers_created: 1, containers_cleaned: 1, residue_entries: retainedRlm.final_artifact.cleanup_residue_entries },
    terminal_decision: "ONE_COMPLETE_RLM_TREATMENT_PROVEN_NONMATRIX",
    nonclaims: ["not a comparative result", "not a matrix member or score", "does not authorize a matrix rerun or RC-7 closure"],
  }, "result_sha256");
  await writeExclusive(path.join(results.root, RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME), result);
  return result;
}

export function buildRc7GateCTreatmentProofSealedResult(input) {
  return buildRc7GateCSealedResult(input);
}

function combinedArtifactSha256(routeOutput) {
  return sha256V1(canonicalJsonV1(routeOutput));
}

export function formatRc7GateCTreatmentProofError(error) {
  return { ok: false, code: ERROR_CODE.test(error?.code ?? "") ? error.code : "UNEXPECTED_ERROR", message: error?.message ?? String(error), details: error?.details ?? null };
}

export const __test = Object.freeze({
  SUPERSEDED_TREATMENT_PROOFS,
  approvalText,
  assertFreshTreatmentProofRoots,
  combinedArtifactSha256,
  validateFreeze,
  reservationKey,
});
