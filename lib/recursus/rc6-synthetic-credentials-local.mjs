import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { CredentialProvider } from '@deepseek-ai/dsh-credentials';

const REFERENCE = 'OPENAI_CODEX_OAUTH';
const SOURCE = 'rc6-validation-synthetic-file';

function encoded(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function syntheticCredential() {
  const accountId = 'acct_rc5_exact_path_provider_free';
  const access = `${encoded({ alg: 'none', typ: 'JWT' })}.${encoded({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.provider-free-signature`;
  return JSON.stringify({
    access,
    accountId,
    expires: 4_102_444_800_000,
    refresh: 'rc5-exact-path-provider-free-refresh',
    type: 'oauth',
  });
}

const CREDENTIAL = syntheticCredential();
const DOCUMENT = `OPENAI_CODEX_OAUTH: '${CREDENTIAL.replaceAll("'", "''")}'\n`;

function exactOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options) ||
      JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(['path', 'watch'])) {
    throw new Error('RC6_SYNTHETIC_CREDENTIAL_OPTIONS');
  }
  if (options.watch !== false || typeof options.path !== 'string' || !isAbsolute(options.path)) {
    throw new Error('RC6_SYNTHETIC_CREDENTIAL_OPTIONS');
  }
  const target = resolve(options.path);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync.native(target) !== target ||
      readFileSync(target, 'utf8') !== DOCUMENT) {
    throw new Error('RC6_SYNTHETIC_CREDENTIAL_DOCUMENT');
  }
  return target;
}

export default class RC6SyntheticCredentialProvider extends CredentialProvider {
  constructor(ctx, options) {
    super(ctx);
    this.path = exactOptions(options);
    this.values = new Map([[REFERENCE, CREDENTIAL]]);
  }

  async resolve(reference) {
    if (reference !== REFERENCE) return undefined;
    return Object.freeze({ source: SOURCE, value: CREDENTIAL });
  }

  async describe(reference) {
    return Object.freeze({
      configured: reference === REFERENCE,
      source: reference === REFERENCE ? SOURCE : undefined,
      writable: reference === REFERENCE,
    });
  }

  async set(reference, value) {
    if (reference !== REFERENCE || value !== CREDENTIAL || readFileSync(this.path, 'utf8') !== DOCUMENT) {
      throw new Error('RC6_SYNTHETIC_CREDENTIAL_WRITE_DENIED');
    }
  }

  async unset() {
    throw new Error('RC6_SYNTHETIC_CREDENTIAL_UNSET_DENIED');
  }
}

