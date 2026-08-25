#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../lib/recursus-benchmark.mjs';
import {
  RC3_INTERNALS_FOR_TESTS,
  RC3_REGISTRATION_ID,
  RC3_SNAPSHOT_ID,
} from '../lib/recursus-route-v16.mjs';

const root = resolve(import.meta.dirname, '..');
const contractRoot = join(root, 'evals', 'recursus', 'rc3-recursus-direct-v16');

const authorityProfile = {
  container_controls: {
    capabilities: 'all_dropped',
    child_process: 'node_permission_denied',
    image_root: 'read_only',
    no_new_privileges: true,
    pids_limit: 128,
    worker_user: '65532:65532',
  },
  credential_boundary: {
    authority: 'registered_runtime_only',
    document: 'container:credentials/.credentials.yaml',
    host_values_observed: false,
    mount: 'credential_home_only_rw',
    owner_mode: '65532:65532:0600',
  },
  filesystem_boundary: {
    credential_home: 'rw',
    evidence_workspace_visible: false,
    evaluator_files_visible: false,
    input: 'ro',
    locks: 'rw',
    output: 'rw',
    seed_workspace: 'ro',
  },
  image: {
    config_digest: 'sha256:52bc9e24dbf176ad211e644575275127bd0a66ae6bc513136b2b0d59a97e7ce7',
    descriptor_digest: 'sha256:8475dfcbe0ee7eec2632ba96f1baf6bf8d92c57c379491bca0d8f6352e5dfae0',
    entrypoint: ['/usr/local/bin/node'],
    manifest_digest: 'sha256:39c642505136e03b19fd755e69c533be27422b59ff6b6505da690a767ef6e6dc',
    platform: 'linux/amd64',
    reference: 'recursus-rc3-v16@sha256:8475dfcbe0ee7eec2632ba96f1baf6bf8d92c57c379491bca0d8f6352e5dfae0',
    user: '65532:65532',
  },
  network_boundary: {
    allowed_connect_authorities: ['auth.openai.com:443', 'chatgpt.com:443'],
    application_fetch_observation: 'exact_url_and_method_guard_without_headers_or_body',
    max_concurrent_tunnels: 1,
    max_oauth_refresh_connect_tunnels_per_adapter_request: 2,
    max_response_connect_tunnels_per_adapter_request: 2,
    provider_request_observation: 'adapter_stream_and_dsh_agent_request_events',
    proxy: 'fresh_external_bridge_connect_allowlist',
    relay: 'network_none_loopback_to_owner_only_unix_socket',
    tls: 'end_to_end_not_intercepted',
    wire_request_count: 'unsupported_end_to_end_tls',
    worker: 'relay_network_namespace_no_routes_no_socket_mount',
  },
  trust_boundary: {
    docker_daemon: 'trusted_host_orchestrator',
    provider_response: 'untrusted_until_normalized_and_validated',
    proxy_and_relay: 'runner_registered_content_safe_observers',
    worker_output: 'untrusted_until_host_reconciliation',
  },
};

const materialization = {
  base_image: {
    digest: 'sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03',
    node_version: '24.19.0',
    platform: 'linux/amd64',
  },
  package_profile: {
    assembly_manifest_sha256: '3a069ccca031e493d38f5494aff192f9ed329850da29037304b23485b7a3cc23',
    distribution_manifest_sha256: '7dc4a35510947b34a60fed168810bdb2d54ef842a271127f3e9b9753c17e8fb1',
    inventory_byte_count: 58894,
    inventory_sha256: 'bec897c13c2e79233a5bc677563918db6fe119eba6f38c55a2204a0f65eddff4',
    package_count: 244,
    profile_lock_byte_count: 1058486,
    profile_lock_sha256: '379b34881b7cac8a31cc5b48b4f71b8ddaa5f30e9c610843b049ac91825ff114',
  },
  packaging_status: {
    exact_archive_matches: 242,
    nonreproducible_archives: ['honcho-bundle', 'rlm-bundle'],
    repeated_archive_count: 244,
    status: 'selected_materialization_validated_not_reproducible',
  },
  parent_image: {
    config_digest: 'sha256:d080bcb385531c1d005c45175ec23afa19ea68ce2ff17d539637e2189056523d',
    reference: 'recursus-rc3-v15:final@sha256:d0a67e848a3a2b0879ccdbb92a87b5f250c8c70c8ce0eaae2e7d291b538646bc',
  },
  runner_layer: {
    build_definition: {
      byte_count: 667,
      path: 'evals/recursus/rc3-recursus-direct-v16/container/Dockerfile.runner',
      sha256: 'f7b20131618338a796189061d580b6307afb2be84bbeef8d04f99b7681f59400',
    },
    context_file_byte_count: 107847,
    context_file_count: 9,
    context_inventory_byte_count: 1298,
    context_inventory_file: {
      byte_count: 1299,
      path: 'evals/recursus/rc3-recursus-direct-v16/runner-context-inventory.json',
      sha256: 'b4429221743c0322bd38310ad11d1ecb282ed6319f92a8beff48624f02590758',
    },
    context_inventory_sha256: 'cb6e49f65829a1589c5aa07ef3fece21847e03e8ea5fa227fb9a1b0be7702b55',
  },
  worker_image: authorityProfile.image,
};

const capabilities = [
  'accepted_seed_ingestion',
  'bounded_output_capture',
  'bridge_input_construction',
  'content_safe_trace',
  'direct_adapter_transport',
  'independent_validation',
  'normalization',
  'runner_manifest',
].map((capabilityId) => ({
  capability_id: capabilityId,
  enabled: true,
  required_for_actual: true,
  required_for_dry_run: true,
  support_status: 'supported',
}));
capabilities.push({
  capability_id: 'runtime_authority_enforcement',
  enabled: true,
  required_for_actual: true,
  required_for_dry_run: false,
  support_status: 'supported',
});

const deviations = [
  'RC3-DEV-MINIMAL-BRIDGE-INPUT',
  'RC3-DEV-NONDURABLE-SINGLE-ATTEMPT',
  'RC3-DEV-NONREPRODUCIBLE-PACKAGE-ORDER',
  'RC3-DEV-ONE-BOUNDED-SUMMARY',
  'RC3-DEV-TLS-WIRE-REQUEST-COUNT-UNOBSERVABLE',
];
const unsupported = [
  'ablations',
  'compiled_prompt_parity',
  'durable_execution_and_recovery',
  'full_career_ops_feature_parity',
  'honcho_enhancements',
  'human_evaluation_and_scoring',
  'reproducible_package_build',
  'recursus_only_enhancements',
  'rlm_enhancements',
  'wire_level_request_count_attestation',
];
const permissions = {
  browser: 'disabled_enforced',
  evidence: 'runner_only_external',
  external_apps: 'disabled_enforced',
  network: 'registered_connect_destinations_enforced',
  provider: 'one_registered_adapter_request_enforced',
  workspace: 'seed_workspace_read_only_enforced',
};
const dryRecordPaths = [
  'artifact-inventory.json',
  'artifacts/assistant-output.md',
  'bridge-input.json',
  'intent.json',
  'normalized-result.json',
  'seed-inventory.json',
  'trace.json',
  'workspace-inventory.json',
];
const completedActualRecordPaths = [
  'artifact-inventory.json',
  'artifacts/assistant-output.md',
  'authority-observation.json',
  'bridge-input.json',
  'intent.json',
  'normalized-result.json',
  'seed-inventory.json',
  'trace.json',
  'worker-observation.json',
  'workspace-inventory.json',
];
const canonicalUtcTimestampPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

function readJson(pathValue) {
  return JSON.parse(readFileSync(pathValue, 'utf8'));
}

function writeJson(pathValue, value) {
  writeFileSync(pathValue, `${canonicalStringify(value)}\n`, 'utf8');
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const contextInventoryPath = join(contractRoot, 'runner-context-inventory.json');
const contextInventoryBytes = readFileSync(contextInventoryPath);
const contextInventory = JSON.parse(contextInventoryBytes.toString('utf8'));
if (`${canonicalStringify(contextInventory)}\n` !== contextInventoryBytes.toString('utf8')) throw new Error('V16 runner context inventory is not canonical.');
const expectedContextSources = new Map([
  ['Dockerfile.runner', join(contractRoot, 'container', 'Dockerfile.runner')],
  ['runner/recursus-route-content-gate-v16.mjs', join(root, 'lib', 'recursus-route-content-gate-v16.mjs')],
  ['runner/recursus-route-html-entities-v16.mjs', join(root, 'lib', 'recursus-route-html-entities-v16.mjs')],
  ['runner/recursus-route-credential-permission-v16.mjs', join(root, 'lib', 'recursus-route-credential-permission-v16.mjs')],
  ['runner/recursus-route-denial-probe-v16.mjs', join(root, 'lib', 'recursus-route-denial-probe-v16.mjs')],
  ['runner/recursus-route-proxy-v16.mjs', join(root, 'lib', 'recursus-route-proxy-v16.mjs')],
  ['runner/recursus-route-relay-v16.mjs', join(root, 'lib', 'recursus-route-relay-v16.mjs')],
  ['runner/recursus-route-socket-init-v16.mjs', join(root, 'lib', 'recursus-route-socket-init-v16.mjs')],
  ['runner/recursus-route-worker-v16.mjs', join(root, 'lib', 'recursus-route-worker-v16.mjs')],
]);
if (!Array.isArray(contextInventory)
    || contextInventory.length !== expectedContextSources.size
    || contextInventory.some((item) => {
      const source = expectedContextSources.get(item.path);
      if (source === undefined) return true;
      const bytes = readFileSync(source);
      return item.byte_count !== bytes.length || item.sha256 !== digest(bytes);
    })) throw new Error('V16 runner context inventory differs from the exact repository sources.');
if (digest(Buffer.from(canonicalStringify(contextInventory), 'utf8')) !== materialization.runner_layer.context_inventory_sha256
    || contextInventoryBytes.length !== materialization.runner_layer.context_inventory_file.byte_count
    || digest(contextInventoryBytes) !== materialization.runner_layer.context_inventory_file.sha256) throw new Error('V16 runner context inventory aggregate differs from registration.');

const registrationPath = join(contractRoot, 'registration.json');
const registration = readJson(registrationPath);
registration.authority_profile = authorityProfile;
registration.capabilities = capabilities;
registration.contracts.parser_version = 'dsh-event-observer-v5';
registration.contracts.validator_version = 'rc3-route-validator-v16';
registration.deviations = deviations;
registration.expected_evidence.authority_observation_path = 'authority-observation.json';
registration.expected_evidence.completed_actual_record_count = completedActualRecordPaths.length;
registration.expected_evidence.completed_actual_record_paths = completedActualRecordPaths;
registration.expected_evidence.cleanup_attestation = 'strict_docker_not_found_inspection';
registration.expected_evidence.dry_run_record_count = dryRecordPaths.length;
registration.expected_evidence.dry_run_record_paths = dryRecordPaths;
registration.expected_evidence.worker_observation_path = 'worker-observation.json';
registration.environment.platforms = ['windows-x64'];
registration.permissions = permissions;
registration.product.working_tree_state = 'uncommitted_rc3_v16_runner_files_hashed';
registration.registered_at = '2026-08-25T01:58:47.281Z';
registration.route.runner.version = '16.0.0';
registration.unsupported_capabilities = unsupported;

const registrationSchemaPath = join(contractRoot, 'schemas', 'registration.schema.json');
const registrationSchema = readJson(registrationSchemaPath);
registrationSchema.properties.registered_at.pattern = canonicalUtcTimestampPattern;
registrationSchema.$defs.runner.properties.version.const = '16.0.0';
registrationSchema.properties.authority_profile = { const: authorityProfile };
registrationSchema.properties.capabilities.minItems = 9;
registrationSchema.properties.capabilities.maxItems = 9;
registrationSchema.properties.unsupported_capabilities.minItems = 10;
registrationSchema.properties.unsupported_capabilities.maxItems = 10;
registrationSchema.properties.contracts.const = registration.contracts;
registrationSchema.properties.environment = { const: registration.environment };
registrationSchema.properties.product = { const: registration.product };
for (const [name, value] of Object.entries({
  authority_observation_path: registration.expected_evidence.authority_observation_path,
  cleanup_attestation: registration.expected_evidence.cleanup_attestation,
  completed_actual_record_count: registration.expected_evidence.completed_actual_record_count,
  completed_actual_record_paths: registration.expected_evidence.completed_actual_record_paths,
  dry_run_record_count: registration.expected_evidence.dry_run_record_count,
  dry_run_record_paths: registration.expected_evidence.dry_run_record_paths,
  worker_observation_path: registration.expected_evidence.worker_observation_path,
})) {
  registrationSchema.properties.expected_evidence.properties[name] = { const: value };
  if (!registrationSchema.properties.expected_evidence.required.includes(name)) registrationSchema.properties.expected_evidence.required.push(name);
}
registrationSchema.properties.permissions.properties.browser.const = permissions.browser;
registrationSchema.properties.permissions.properties.external_apps.const = permissions.external_apps;
registrationSchema.properties.permissions.properties.network.const = permissions.network;
registrationSchema.properties.permissions.properties.provider.const = permissions.provider;
registrationSchema.properties.permissions.properties.workspace.const = permissions.workspace;
if (!registrationSchema.required.includes('authority_profile')) registrationSchema.required.push('authority_profile');

const manifestSchemaPath = join(contractRoot, 'schemas', 'runner-manifest.schema.json');
const manifestSchema = readJson(manifestSchemaPath);
manifestSchema.properties.recorded_at.pattern = canonicalUtcTimestampPattern;
manifestSchema.properties.authority_profile = { const: authorityProfile };
manifestSchema.properties.capabilities.const = capabilities;
manifestSchema.properties.contracts.const = registration.contracts;
manifestSchema.properties.deviations.const = deviations;
manifestSchema.properties.environment = { const: registration.environment };
manifestSchema.properties.permission_profile.const = permissions;
manifestSchema.properties.product = { const: registration.product };
manifestSchema.properties.runner.const.version = '16.0.0';
manifestSchema.properties.unsupported_capabilities.const = unsupported;
for (const [name, schema] of Object.entries({
  adapter_invocation_count: { maximum: 2, minimum: 0, type: 'integer' },
  application_fetch_count: { maximum: 3, minimum: 0, type: 'integer' },
  authority_attestation_valid: { type: 'boolean' },
  discarded_reasoning_block_count: { maximum: 4096, minimum: 0, type: 'integer' },
  inbox_transition_matched: { type: 'boolean' },
  input_message_matched: { type: 'boolean' },
  request_context_matched: { type: 'boolean' },
  observed_unsupported_capabilities: { items: { const: 'direct_adapter_transport' }, maxItems: 1, type: 'array', uniqueItems: true },
  oauth_fetch_count: { maximum: 2, minimum: 0, type: 'integer' },
  proxy_denied_count: { maximum: 16, minimum: 0, type: 'integer' },
  proxy_download_bytes: { maximum: 12582913, minimum: 0, type: 'integer' },
  proxy_oauth_tunnel_count: { maximum: 2, minimum: 0, type: 'integer' },
  proxy_responses_tunnel_count: { maximum: 2, minimum: 0, type: 'integer' },
  proxy_upload_bytes: { maximum: 12582913, minimum: 0, type: 'integer' },
  relay_connection_count: { maximum: 4, minimum: 0, type: 'integer' },
  responses_fetch_count: { maximum: 2, minimum: 0, type: 'integer' },
  text_block_count: { maximum: 4096, minimum: 0, type: 'integer' },
  unregistered_fetch_count: { maximum: 1, minimum: 0, type: 'integer' },
})) {
  manifestSchema.properties.execution.properties[name] = schema;
  if (!manifestSchema.properties.execution.required.includes(name)) manifestSchema.properties.execution.required.push(name);
}
manifestSchema.properties.inputs.properties.authority_observation = {
  anyOf: [{ $ref: '#/$defs/ref' }, { type: 'null' }],
};
manifestSchema.properties.inputs.properties.worker_observation = {
  anyOf: [{ $ref: '#/$defs/ref' }, { type: 'null' }],
};
for (const name of ['authority_observation', 'worker_observation']) {
  if (!manifestSchema.properties.inputs.required.includes(name)) manifestSchema.properties.inputs.required.push(name);
}
manifestSchema.properties.records.maxItems = 10;
manifestSchema.properties.records.minItems = 8;
manifestSchema.allOf = [
  {
    if: { properties: { attempt_kind: { const: 'dry_run' } }, required: ['attempt_kind'] },
    then: {
      properties: {
        inputs: { properties: { authority_observation: { type: 'null' }, worker_observation: { type: 'null' } } },
        records: { maxItems: 8, minItems: 8 },
      },
    },
  },
  {
    if: { properties: { attempt_kind: { const: 'actual' } }, required: ['attempt_kind'] },
    then: {
      properties: {
        inputs: { properties: { authority_observation: { $ref: '#/$defs/ref' }, worker_observation: { $ref: '#/$defs/ref' } } },
        records: { maxItems: 10, minItems: 9 },
      },
    },
  },
  {
    if: {
      properties: {
        attempt_kind: { const: 'actual' },
        execution: { properties: { artifact_captured: { const: true } }, required: ['artifact_captured'] },
      },
      required: ['attempt_kind', 'execution'],
    },
    then: { properties: { records: { maxItems: 10, minItems: 10 } } },
  },
  {
    if: {
      properties: {
        attempt_kind: { const: 'actual' },
        execution: { properties: { artifact_captured: { const: false } }, required: ['artifact_captured'] },
      },
      required: ['attempt_kind', 'execution'],
    },
    then: { properties: { records: { maxItems: 9, minItems: 9 } } },
  },
];
if (!manifestSchema.required.includes('authority_profile')) manifestSchema.required.push('authority_profile');

const traceSchemaPath = join(contractRoot, 'schemas', 'trace.schema.json');
const traceSchema = readJson(traceSchemaPath);
traceSchema.properties.events.minItems = 30;
traceSchema.properties.events.maxItems = 30;
traceSchema.properties.events.items.properties.code.enum = [
  'adapter_registered',
  'adapter_invocation_count',
  'application_fetch_count',
  'artifact_captured',
  'authority_attestation_valid',
  'content_scan_passed',
  'direct_adapter_invocation_observed',
  'discarded_reasoning_block_count',
  'inbox_transition_matched',
  'input_message_matched',
  'oauth_fetch_count',
  'post_run_scan_passed',
  'provider_request_count',
  'proxy_denied_count',
  'proxy_download_bytes',
  'proxy_oauth_tunnel_count',
  'proxy_responses_tunnel_count',
  'proxy_upload_bytes',
  'request_context_matched',
  'registered_runtime_loaded',
  'relay_connection_count',
  'responses_fetch_count',
  'runner_input_validated',
  'runtime_started',
  'seed_validated',
  'text_block_count',
  'trusted_terminal_event_count',
  'trusted_terminal_success',
  'unregistered_fetch_count',
  'workspace_unchanged',
];

const normalizedSchemaPath = join(contractRoot, 'schemas', 'normalized-result.schema.json');
const normalizedSchema = readJson(normalizedSchemaPath);
if (!normalizedSchema.properties.termination_reason.enum.includes('authority_attestation_failed')) {
  normalizedSchema.properties.termination_reason.enum.push('authority_attestation_failed');
  normalizedSchema.properties.termination_reason.enum.sort();
}
normalizedSchema.properties.external_mutations = {
  items: { const: 'unexpected_external_mutation' },
  maxItems: 1,
  type: 'array',
  uniqueItems: true,
};
normalizedSchema.properties.observed_unsupported_capabilities = {
  items: { const: 'direct_adapter_transport' },
  maxItems: 1,
  type: 'array',
  uniqueItems: true,
};
if (!normalizedSchema.required.includes('observed_unsupported_capabilities')) normalizedSchema.required.push('observed_unsupported_capabilities');

const authorityObservationSchemaPath = join(contractRoot, 'schemas', 'authority-observation.schema.json');
const authorityObservationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  additionalProperties: false,
  properties: {
    attempt_id: { const: 'RC3-ATTEMPT-REC-DIRECT-V16-FACT-01-R01' },
    artifact_captured: { type: 'boolean' },
    artifact_valid: { type: 'boolean' },
    authentication_available: { const: true },
    authority_attestation_valid: { type: 'boolean' },
    budget_exceeded: { type: 'boolean' },
    cleanup_observation: {
      additionalProperties: false,
      properties: {
        container_inspect_not_found_count: { const: 3 },
        inspection_error_count: { const: 0 },
        network_inspect_not_found_count: { const: 1 },
        outcome: { const: 'strict_not_found' },
        volume_inspect_not_found_count: { const: 1 },
      },
      required: ['container_inspect_not_found_count', 'inspection_error_count', 'network_inspect_not_found_count', 'outcome', 'volume_inspect_not_found_count'],
      type: 'object',
    },
    content_scan_passed: { type: 'boolean' },
    credential_scan_passed: { type: 'boolean' },
    external_mount_topology_valid: { type: 'boolean' },
    external_resources_cleaned: { type: 'boolean' },
    image_identity_matched: { const: true },
    observation_id: { const: 'AUTHORITY-RC3-ATTEMPT-REC-DIRECT-V16-FACT-01-R01' },
    process_exit_code: { maximum: 255, minimum: 0, type: 'integer' },
    process_oom_killed: { type: 'boolean' },
    process_signal: { type: ['string', 'null'] },
    oracle_scan_passed: { type: 'boolean' },
    post_run_scan_passed: { type: 'boolean' },
    proxy_clean_shutdown: { type: 'boolean' },
    proxy_denial_reasons: {
      items: {
        enum: ['concurrency', 'destination', 'destination_cap', 'dns_failure', 'header_bytes', 'header_count', 'header_timeout', 'host_header', 'malformed_header', 'non_global_address', 'proxy_failure', 'request_line', 'sensitive_header'],
      },
      maxItems: 16,
      type: 'array',
    },
    proxy_denied_count: { maximum: 16, minimum: 0, type: 'integer' },
    proxy_download_bytes: { maximum: 12582913, minimum: 0, type: 'integer' },
    proxy_oauth_tunnel_count: { maximum: 2, minimum: 0, type: 'integer' },
    proxy_responses_tunnel_count: { maximum: 2, minimum: 0, type: 'integer' },
    proxy_upload_bytes: { maximum: 12582913, minimum: 0, type: 'integer' },
    proxy_unexpected_count: { maximum: 16, minimum: 0, type: 'integer' },
    relay_clean_shutdown: { type: 'boolean' },
    relay_connection_count: { maximum: 4, minimum: 0, type: 'integer' },
    relay_upstream_failure_count: { maximum: 16, minimum: 0, type: 'integer' },
    schema_version: { const: '1.0' },
    tunnel_count_reconciled: { type: 'boolean' },
    unexpected_external_mutation: { type: 'boolean' },
    workspace_unchanged: { type: 'boolean' },
  },
  required: [
    'attempt_id', 'artifact_captured', 'artifact_valid', 'authentication_available',
    'authority_attestation_valid', 'budget_exceeded', 'cleanup_observation', 'content_scan_passed',
    'credential_scan_passed', 'external_mount_topology_valid', 'external_resources_cleaned',
    'image_identity_matched', 'observation_id', 'oracle_scan_passed',
    'post_run_scan_passed', 'process_exit_code', 'process_oom_killed', 'process_signal', 'proxy_clean_shutdown',
    'proxy_denial_reasons', 'proxy_denied_count', 'proxy_download_bytes', 'proxy_oauth_tunnel_count',
    'proxy_responses_tunnel_count', 'proxy_upload_bytes', 'proxy_unexpected_count', 'relay_clean_shutdown',
    'relay_connection_count', 'relay_upstream_failure_count', 'schema_version',
    'tunnel_count_reconciled', 'unexpected_external_mutation', 'workspace_unchanged',
  ],
  type: 'object',
};

const workerObservationSchemaPath = join(contractRoot, 'schemas', 'worker-observation.schema.json');
const workerObservationSchema = JSON.parse(JSON.stringify(manifestSchema.properties.execution));
workerObservationSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';

const snapshotSchemaPath = join(contractRoot, 'schemas', 'source-snapshot.schema.json');
const snapshotSchema = readJson(snapshotSchemaPath);
snapshotSchema.properties.execution_materialization = { const: materialization };
if (!snapshotSchema.required.includes('execution_materialization')) snapshotSchema.required.push('execution_materialization');

writeJson(registrationSchemaPath, registrationSchema);
writeJson(manifestSchemaPath, manifestSchema);
const attemptIntentSchemaPath = join(contractRoot, 'schemas', 'attempt-intent.schema.json');
const attemptIntentSchema = readJson(attemptIntentSchemaPath);
attemptIntentSchema.properties.recorded_at.pattern = canonicalUtcTimestampPattern;
writeJson(attemptIntentSchemaPath, attemptIntentSchema);
const attemptReservationSchemaPath = join(contractRoot, 'schemas', 'attempt-reservation.schema.json');
const attemptReservationSchema = readJson(attemptReservationSchemaPath);
attemptReservationSchema.properties.reserved_at.pattern = canonicalUtcTimestampPattern;
writeJson(attemptReservationSchemaPath, attemptReservationSchema);
writeJson(traceSchemaPath, traceSchema);
writeJson(normalizedSchemaPath, normalizedSchema);
writeJson(authorityObservationSchemaPath, authorityObservationSchema);
writeJson(workerObservationSchemaPath, workerObservationSchema);
writeJson(snapshotSchemaPath, snapshotSchema);
writeJson(registrationPath, registration);

const registrationBytes = readFileSync(registrationPath);
const snapshotPath = join(contractRoot, 'source-snapshot.json');
const snapshot = readJson(snapshotPath);
snapshot.execution_materialization = materialization;
snapshot.registration = {
  byte_count: registrationBytes.length,
  path: 'evals/recursus/rc3-recursus-direct-v16/registration.json',
  sha256: digest(registrationBytes),
};
snapshot.registration_id = RC3_REGISTRATION_ID;
snapshot.snapshot_id = RC3_SNAPSHOT_ID;
snapshot.runner_files = RC3_INTERNALS_FOR_TESTS.EXPECTED_RUNNER_FILE_PATHS.map((pathValue) => {
  const bytes = readFileSync(join(root, ...pathValue.split('/')));
  return { byte_count: bytes.length, path: pathValue, sha256: digest(bytes) };
});
writeJson(snapshotPath, snapshot);

process.stdout.write(`${JSON.stringify({ registration_sha256: snapshot.registration.sha256, runner_file_count: snapshot.runner_files.length, snapshot_id: snapshot.snapshot_id })}\n`);
