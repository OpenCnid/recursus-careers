import { chownSync, chmodSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';

const root = '/run/rc3-socket';
const target = `${root}/v17`;
const rootInfo = lstatSync(root);
if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || readdirSync(root).length !== 0) throw new Error('socket volume must be fresh');
mkdirSync(target, { mode: 0o700 });
chownSync(target, 65_532, 65_532);
chmodSync(target, 0o700);
