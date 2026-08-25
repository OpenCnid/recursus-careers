import { chownSync, chmodSync, closeSync, lstatSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';

const credential = '/credentials/.credentials.yaml';
const probe = '/credentials/.rc3-permission-probe';
const renamedProbe = '/credentials/.rc3-permission-probe-renamed';
const command = process.argv[2];
const initial = lstatSync(credential);
if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1) throw new Error('credential path type mismatch');
if (command === 'initialize') {
  chownSync(credential, 65_532, 65_532);
  chmodSync(credential, 0o600);
} else if (!['probe', 'verify'].includes(command)) {
  throw new Error('credential permission command invalid');
}
const secured = lstatSync(credential);
if ((secured.mode & 0o777) !== 0o600 || secured.uid !== 65_532 || secured.gid !== 65_532) throw new Error('credential owner-only mode unavailable');
if (command === 'initialize' || command === 'verify') process.exit(0);
let descriptor;
try {
  descriptor = openSync(probe, 'wx', 0o600);
  writeSync(descriptor, Buffer.from('synthetic-probe\n', 'utf8'));
  closeSync(descriptor);
  descriptor = undefined;
  renameSync(probe, renamedProbe);
  rmSync(renamedProbe);
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
  try { rmSync(probe); } catch {}
  try { rmSync(renamedProbe); } catch {}
}
