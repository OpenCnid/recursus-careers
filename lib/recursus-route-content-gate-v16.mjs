const PRIVATE_PATH_PATTERNS = [
  /[A-Za-z]:(?:\\+|\/(?!\/))[^\\/\s]+/u,
  /\\{2,}[^\\/\s]+\\+[^\\/\s]+/u,
  /(?:^|[^A-Za-z0-9._/\\:-])\/{2}[^/\s]+\/[^/\s]+/u,
  /file:\/{3}(?:[A-Za-z]:\/|\/)?[^/\s]+/iu,
  /(?:^|[^A-Za-z0-9._/\\-])\/(?!\/)[^/\s"'`<>{}|]+(?:\/[^/\s"'`<>{}|]+)*/u,
];
const REGISTERED_CONTAINER_PATH_PATTERN = /(^|[\s"'`=([{,])\/(?:(?:credentials|input|locks|output|seed|workspace)(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+)*|opt\/(?:rc3|recursus-profile)(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+)*|run\/rc3(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+)*|usr\/local\/bin\/node|\.dockerenv)(?=$|[\s"'`)\]},;!?])/gu;
const CREDENTIAL_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/u,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{8,}\b/iu,
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/u,
  /["'`]?\b(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|OAUTH[_-]?TOKEN|REFRESH[_-]?TOKEN|SESSION[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PRIVATE[_-]?KEY|SECRET[_-]?KEY|SECRET[_-]?ACCESS[_-]?KEY|AWS[_-]?ACCESS[_-]?KEY[_-]?ID|AWS[_-]?SECRET[_-]?ACCESS[_-]?KEY|AWS[_-]?SESSION[_-]?TOKEN|OPENAI_CODEX_OAUTH)\b["'`]?\s*[:=]\s*\S+/iu,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/iu,
];
const CREDENTIAL_JSON_KEYS = new Set([
  'accesstoken', 'apikey', 'authtoken', 'clientsecret', 'oauthtoken', 'password', 'privatekey',
  'refreshtoken', 'secretkey', 'secretaccesskey', 'sessiontoken', 'awsaccesskeyid',
  'awssecretaccesskey', 'awssessiontoken', 'openaicodexoauth', 'accountid', 'authorizationcode',
  'devicecode', 'expiresat', 'idtoken', 'proxyauthorization', 'cookie', 'access', 'refresh', 'expires',
]);
const HTML_LEGACY_NAMES_BY_LENGTH = Object.freeze([...HTML_LEGACY_ENTITY_NAMES].sort((left, right) => right.length - left.length || left.localeCompare(right, 'en-US')));

export class StagingContentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StagingContentError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new StagingContentError(code, message);
}

function withoutDisallowedControls(text) {
  return text.replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '');
}

function normalizedText(bytes, logicalPath) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.some((byte) => byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) reject('CONTENT_ENCODING', `${logicalPath} contains a disallowed control byte.`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).normalize('NFC'); } catch { reject('UTF8', `${logicalPath} is not valid UTF-8.`); }
}

function assertNoLoneSurrogates(value, logicalPath) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) reject('CONTENT_ENCODING', `${logicalPath} contains an invalid Unicode surrogate.`);
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) reject('CONTENT_ENCODING', `${logicalPath} contains an invalid Unicode surrogate.`);
  }
}

function decodedJsonStrings(text, logicalPath) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const strings = [];
  const stack = [{ depth: 0, value: parsed }];
  let visited = 0;
  while (stack.length > 0) {
    const { depth, value } = stack.pop();
    if (++visited > 100_000 || depth > 64) reject('CONTENT_STRUCTURE', `${logicalPath} exceeds the JSON scan bound.`);
    if (typeof value === 'string') {
      assertNoLoneSurrogates(value, logicalPath);
      strings.push(value.normalize('NFC'));
    } else if (Array.isArray(value)) {
      for (const item of value) stack.push({ depth: depth + 1, value: item });
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        strings.push(key.normalize('NFC'));
        stack.push({ depth: depth + 1, value: item });
      }
    }
  }
  return strings;
}

function decodedUnicodeVariants(text, logicalPath) {
  if (!/(?:\\u|%u)[0-9A-Fa-f]{4}/u.test(text)) return [];
  const decoded = text.replaceAll(/(?:\\u|%u)([0-9A-Fa-f]{4})/gu, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
  assertNoLoneSurrogates(decoded, logicalPath);
  return [decoded.normalize('NFC')];
}

function decodedHtmlVariants(text, logicalPath) {
  if (!/&(#[xX][0-9A-Fa-f]+;?|#[0-9]+;?|[A-Za-z][A-Za-z0-9]*)/u.test(text)) return [];
  const compacted = text.replaceAll(/(&(?:#[xX][0-9A-Fa-f]+|#[0-9]+))[ \t\r\n]+(?=&(?:#[xX][0-9A-Fa-f]+|#[0-9]+))/gu, '$1');
  const variants = new Set();
  let count = 0;
  for (const input of new Set([text, compacted])) {
    const numericDecoded = input.replaceAll(/&(#[xX][0-9A-Fa-f]+;?|#[0-9]+;?)/gu, (_match, entity) => {
      if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many HTML entities.`);
      const hexadecimal = /^#[xX]/u.test(entity);
      const numeric = entity.endsWith(';') ? entity.slice(0, -1) : entity;
      const value = Number.parseInt(numeric.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || value >= 0xd800 && value <= 0xdfff) reject('CONTENT_ENCODING', `${logicalPath} contains an invalid HTML entity.`);
      return String.fromCodePoint(value);
    });
    if (numericDecoded !== input) variants.add(numericDecoded.normalize('NFC'));
    const namedDecoded = input.replaceAll(/&([A-Za-z][A-Za-z0-9]+);/gu, (match, name) => {
      if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many HTML entities.`);
      return Object.hasOwn(HTML_NAMED_ENTITY_VALUES, name) ? HTML_NAMED_ENTITY_VALUES[name] : match;
    });
    if (namedDecoded !== input) variants.add(namedDecoded.normalize('NFC'));
    const legacyDecoded = input.replaceAll(/&([A-Za-z][A-Za-z0-9]*)/gu, (match, run) => {
      if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many HTML entities.`);
      const name = HTML_LEGACY_NAMES_BY_LENGTH.find((candidate) => run.startsWith(candidate));
      return name === undefined ? match : `${HTML_NAMED_ENTITY_VALUES[name]}${run.slice(name.length)}`;
    });
    if (legacyDecoded !== input) variants.add(legacyDecoded.normalize('NFC'));
  }
  return [...variants];
}

function decodedHtmlMarkupVariants(text, logicalPath) {
  let renderedOutput = '';
  let pathOutput = '';
  let cursor = 0;
  let stripped = false;
  let count = 0;
  while (cursor < text.length) {
    const opening = text.indexOf('<', cursor);
    if (opening < 0) {
      renderedOutput += text.slice(cursor);
      pathOutput += text.slice(cursor);
      break;
    }
    renderedOutput += text.slice(cursor, opening);
    pathOutput += text.slice(cursor, opening);
    if (text.startsWith('<!--', opening)) {
      const closing = text.indexOf('-->', opening + 4);
      if (closing < 0 || closing - opening > 4_096) reject('CONTENT_ENCODING', `${logicalPath} contains malformed or oversized HTML markup.`);
      pathOutput += text.slice(opening, closing + 3);
      cursor = closing + 3;
      stripped = true;
    } else {
      const tail = text.slice(opening);
      const tag = /^<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>])/u.exec(tail);
      const declaration = /^<(?:!|\?)/u.exec(tail);
      if (!tag && !declaration) {
        renderedOutput += '<';
        pathOutput += '<';
        cursor = opening + 1;
        continue;
      }
      let quote = '';
      let closing = -1;
      for (let index = opening + (tag ?? declaration)[0].length; index < text.length && index - opening <= 4_096; index++) {
        const character = text[index];
        if (quote) {
          if (character === quote) quote = '';
        } else if (character === '"' || character === "'") quote = character;
        else if (character === '>') {
          closing = index;
          break;
        }
      }
      if (closing < 0) reject('CONTENT_ENCODING', `${logicalPath} contains malformed or oversized HTML markup.`);
      if (tail.startsWith('</')) pathOutput += text.slice(opening + tag[0].length, closing + 1);
      else pathOutput += text.slice(opening, closing + 1);
      cursor = closing + 1;
      stripped = true;
    }
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many HTML tokens.`);
  }
  return stripped ? [...new Set([renderedOutput.normalize('NFC'), pathOutput.normalize('NFC')])] : [];
}

export function stagingHtmlPathProjections(text, logicalPath = 'staged content') {
  const variants = decodedHtmlMarkupVariants(text, logicalPath);
  return variants.length === 0 ? [text] : variants;
}

function decodedHtmlCommentVariants(text, logicalPath) {
  if (!text.includes('<!--') && !text.includes('-->')) return [];
  let count = 0;
  const decoded = text.replaceAll(/<!--[\s\S]*?-->/gu, () => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many HTML comments.`);
    return '';
  });
  if (decoded.includes('<!--') || decoded.includes('-->')) reject('CONTENT_ENCODING', `${logicalPath} contains an unclosed HTML comment.`);
  return [decoded];
}

function decodedQuotedPrintableVariants(text) {
  if (!/(?:=[0-9A-Fa-f]{2}|=\r?\n)/u.test(text)) return [];
  return [text.replaceAll(/=\r?\n/gu, '').replaceAll(/=([0-9A-Fa-f]{2})/gu, (_match, hex) => `%${hex}`)];
}

function decodedMarkdownVariants(text, logicalPath) {
  const variants = new Set();
  let count = 0;
  const referenceDefinitions = new Set();
  for (const match of text.matchAll(/^[ \t]{0,3}\[([^\]\r\n]{1,4096})\]:[ \t]+\S[^\r\n]*$/gmu)) {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown references.`);
    referenceDefinitions.add(match[1].trim().replaceAll(/[ \t\r\n]+/gu, ' ').toLocaleLowerCase('en-US'));
  }
  const addChanged = (candidate) => {
    if (candidate !== text) variants.add(candidate.normalize('NFC'));
  };
  addChanged(text.replaceAll(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, (_match, character) => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown escapes.`);
    return character;
  }));
  addChanged(text.replaceAll(/(?:\*{1,3}|_{2,3}|~{2}|`{1,3})/gu, (marker) => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown delimiters.`);
    return '';
  }));
  addChanged(text.replaceAll(/(?<![A-Za-z0-9])_([^\s_\r\n](?:[^_\r\n]*?[^\s_\r\n])?)_(?![A-Za-z0-9])/gu, (_match, content) => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown emphasis spans.`);
    return content;
  }));
  addChanged(text.replaceAll(/!?\[([^\]\r\n]{0,4096})\]\(([^)\r\n]{0,4096})\)/gu, (_match, label) => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown links.`);
    return label;
  }));
  addChanged(text.replaceAll(/!?\[([^\]\r\n]{0,4096})\]\[[^\]\r\n]{0,4096}\]/gu, (_match, label) => {
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown references.`);
    return label;
  }));
  if (referenceDefinitions.size > 0) addChanged(text.replaceAll(/\[([^\]\r\n]{1,4096})\](?![\[(])/gu, (match, label) => {
    const normalized = label.trim().replaceAll(/[ \t\r\n]+/gu, ' ').toLocaleLowerCase('en-US');
    if (!referenceDefinitions.has(normalized)) return match;
    if (++count > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many Markdown shortcut references.`);
    return label;
  }));
  return [...variants];
}

function decodedUnicodeFormatVariants(text) {
  const decoded = text.replaceAll(/\p{Default_Ignorable_Code_Point}/gu, '');
  return decoded === text ? [] : [decoded.normalize('NFC')];
}

function decodedPercentVariants(text, logicalPath) {
  if (!/%[0-9A-Fa-f]{2}/u.test(text)) return [];
  const variants = [];
  let current = text;
  for (let depth = 0; depth < 8; depth++) {
    const next = current.replaceAll(/%([0-9A-Fa-f]{2})/gu, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    if (next === current) return variants;
    variants.push(next);
    current = next;
  }
  if (/%[0-9A-Fa-f]{2}/u.test(current)) reject('CONTENT_ENCODING', `${logicalPath} percent encoding exceeds the decode bound.`);
  return variants;
}

function decodeUtf32(bytes, littleEndian) {
  if (bytes.length < 8 || bytes.length % 4 !== 0) return null;
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const code = littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    value += code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
  }
  return value.normalize('NFC');
}

function decodedOpaqueVariants(text, logicalPath) {
  const variants = [];
  let frontier = [text.trim()];
  const seen = new Set(frontier);
  let candidateCount = 0;
  let expandedBytes = 0;
  for (let depth = 0; depth < 4; depth++) {
    const next = [];
    for (const value of frontier) {
      const encoded = new Set([value]);
      for (const match of value.matchAll(/[A-Za-z0-9+/_-]{8,}={0,2}/gu)) encoded.add(match[0]);
      for (const match of value.matchAll(/[0-9A-Fa-f]{8,}/gu)) encoded.add(match[0]);
      for (const match of value.matchAll(/(?<![A-Za-z0-9+/_-])(?:[A-Za-z0-9+/_-]+[ \t\r\n]+)+[A-Za-z0-9+/_-]+={0,2}(?![A-Za-z0-9+/_-])/gu)) encoded.add(match[0].replaceAll(/[ \t\r\n]/gu, ''));
      for (const match of value.matchAll(/(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}[ \t\r\n,.:\-]+){3,}[0-9A-Fa-f]{2}(?![0-9A-Fa-f])/gu)) encoded.add(match[0].replaceAll(/[ \t\r\n,.:\-]/gu, ''));
      for (const match of value.matchAll(/(?<![0-9A-Fa-f])(?:(?:0x|\\x)[0-9A-Fa-f]{2}[ \t\r\n,:-]*){4,}(?![0-9A-Fa-f])/gu)) encoded.add(match[0].replaceAll(/(?:0x|\\x)|[ \t\r\n,:-]/gu, ''));
      const byteCandidates = [];
      for (const candidate of encoded) {
        if (++candidateCount > 4_096) reject('CONTENT_ENCODING', `${logicalPath} has too many opaque candidates.`);
        if (candidate.length < 8 || candidate.length > 262_144) continue;
        if (candidate.length % 2 === 0 && /^[0-9A-Fa-f]+$/u.test(candidate)) {
          const bytes = Buffer.from(candidate, 'hex');
          if (bytes.toString('hex') === candidate.toLocaleLowerCase('en-US')) byteCandidates.push(bytes);
        }
        if (/^[A-Za-z0-9+/_-]+={0,2}$/u.test(candidate)) {
          const normalized = candidate.replaceAll('-', '+').replaceAll('_', '/').replace(/=+$/u, '');
          if (normalized.length % 4 !== 1) {
            const bytes = Buffer.from(`${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`, 'base64');
            if (bytes.toString('base64').replace(/=+$/u, '') === normalized) byteCandidates.push(bytes);
          }
        }
      }
      for (const bytes of byteCandidates) {
        expandedBytes += bytes.length;
        if (expandedBytes > 1_048_576) reject('CONTENT_ENCODING', `${logicalPath} opaque decoding exceeds the expansion bound.`);
        const decoded = [];
        try {
          const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes).normalize('NFC');
          if (!utf8.includes('\u0000')) decoded.push(utf8);
        } catch {}
        for (let offset = 0; offset < 2; offset++) {
          const usable = Math.floor((bytes.length - offset) / 2) * 2;
          if (usable >= 4) {
            const candidate = bytes.subarray(offset, offset + usable);
            decoded.push(new TextDecoder('utf-16le').decode(candidate).normalize('NFC'));
            decoded.push(new TextDecoder('utf-16be').decode(candidate).normalize('NFC'));
          }
        }
        for (let offset = 0; offset < 4; offset++) {
          const usable = Math.floor((bytes.length - offset) / 4) * 4;
          if (usable < 8) continue;
          const candidate = bytes.subarray(offset, offset + usable);
          const utf32le = decodeUtf32(candidate, true);
          const utf32be = decodeUtf32(candidate, false);
          if (utf32le !== null) decoded.push(utf32le);
          if (utf32be !== null) decoded.push(utf32be);
        }
        for (const candidate of decoded) {
          if (!seen.has(candidate)) {
            seen.add(candidate);
            variants.push(candidate);
            next.push(candidate.trim());
          }
        }
      }
    }
    frontier = next;
  }
  return variants;
}

export function decodedStagingContentVariants(text, logicalPath) {
  const seen = new Set([text]);
  const queue = [{ depth: 0, value: text }];
  let cursor = 0;
  let expandedBytes = Buffer.byteLength(text, 'utf8');
  while (cursor < queue.length) {
    const { depth, value } = queue[cursor++];
    const derived = [
      ...decodedJsonStrings(value, logicalPath),
      ...decodedUnicodeVariants(value, logicalPath),
      ...decodedHtmlCommentVariants(value, logicalPath),
      ...decodedHtmlMarkupVariants(value, logicalPath),
      ...decodedHtmlVariants(value, logicalPath),
      ...decodedMarkdownVariants(value, logicalPath),
      ...decodedQuotedPrintableVariants(value),
      ...decodedUnicodeFormatVariants(value),
      ...decodedPercentVariants(value, logicalPath),
      ...decodedOpaqueVariants(value, logicalPath),
    ];
    for (const candidate of derived) {
      const normalized = withoutDisallowedControls(candidate).normalize('NFC');
      if (normalized.length === 0) continue;
      if (seen.has(normalized)) continue;
      if (depth >= 8) reject('CONTENT_ENCODING', `${logicalPath} nested encoding exceeds the transform bound.`);
      expandedBytes += Buffer.byteLength(normalized, 'utf8');
      if (expandedBytes > 2_097_152 || seen.size >= 8_192) reject('CONTENT_ENCODING', `${logicalPath} decoded content exceeds the closure bound.`);
      seen.add(normalized);
      queue.push({ depth: depth + 1, value: normalized });
    }
  }
  return [...seen];
}

function credentialKey(key) {
  const normalized = key.normalize('NFC').toLocaleLowerCase('en-US').replaceAll(/[_\-\s"'`]/gu, '');
  return [...CREDENTIAL_JSON_KEYS].some((candidate) => normalized.endsWith(candidate));
}

function hasJsonCredentialKey(text, logicalPath) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return false; }
  const stack = [{ depth: 0, value: parsed }];
  let visited = 0;
  while (stack.length > 0) {
    const { depth, value } = stack.pop();
    if (++visited > 100_000 || depth > 64) reject('CONTENT_STRUCTURE', `${logicalPath} exceeds the credential scan bound.`);
    if (Array.isArray(value)) for (const item of value) stack.push({ depth: depth + 1, value: item });
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (credentialKey(key)) return true;
      stack.push({ depth: depth + 1, value: item });
    }
  }
  return false;
}

function hasRawCredentialAssignment(text) {
  for (const line of text.split(/\r?\n/u)) {
    const colon = line.indexOf(':');
    const equals = line.indexOf('=');
    const delimiter = colon < 0 ? equals : equals < 0 ? colon : Math.min(colon, equals);
    if (delimiter > 0 && line.slice(delimiter + 1).trim().length > 0 && credentialKey(line.slice(0, delimiter).trim())) return true;
  }
  return false;
}

export function assertStagingContentSafe(bytes, logicalPath = 'staged content', options = {}) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const variants = decodedStagingContentVariants(normalizedText(bytes, logicalPath), logicalPath);
  if (variants.some((value) => hasJsonCredentialKey(value, logicalPath)
      || hasRawCredentialAssignment(value)
      || CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value)))) reject('CREDENTIAL_LEAK', `${logicalPath} contains credential-shaped content.`);
  if (options.allowPrivatePaths !== true && variants.some((value) => stagingHtmlPathProjections(value, logicalPath).some((pathText) => {
    const withoutRegistered = pathText.replaceAll(REGISTERED_CONTAINER_PATH_PATTERN, (_match, prefix) => `${prefix}registered-container-path`);
    return PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(withoutRegistered));
  }))) reject('PRIVATE_PATH_LEAK', `${logicalPath} contains an absolute host path.`);
  return true;
}
import { HTML_LEGACY_ENTITY_NAMES, HTML_NAMED_ENTITY_VALUES } from './recursus-route-html-entities-v16.mjs';
