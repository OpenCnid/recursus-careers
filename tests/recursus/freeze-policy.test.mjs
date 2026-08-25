import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from '../helpers.mjs';

const read = (path) => readFileSync(join(ROOT, ...path.split('/')), 'utf-8');

console.log('\nTesting Recursus freeze-policy instruction routing...');

const canonical = read('docs/recursus/AGENTS.md');
const canonicalSha256 = createHash('sha256').update(canonical).digest('hex');
const expectedCanonicalSha256 = '115c9066e72ee373836c8d7cf21228bbba97246f4a409d3d6fc44266a064e630';
const requiredRules = [
  'Development happens in one mutable, unversioned draft.',
  'Complete red-team, denial, negative, portability, and dry-run review before freezing.',
  'The default budget is one frozen registration and one provider attempt per milestone.',
  'Creating a new frozen version requires explicit user approval.',
  'A second provider attempt requires explicit user approval.',
  'Request explicit user approval before work on one milestone execution exceeds two hours.',
  'Version numbers identify deliberate frozen contracts, not internal bug-fix iterations.',
  'Keep rejected drafts outside the repository unless they contain uniquely valuable audit evidence',
  'must not silently start another implementation cycle.',
];
const missingRules = requiredRules.filter((rule) => !canonical.includes(rule));
if (
  missingRules.length === 0
  && !canonical.includes('progress after 60 minutes')
  && canonicalSha256 === expectedCanonicalSha256
) {
  pass('canonical Recursus instructions retain the approved freeze policy without a 60-minute rule');
} else {
  fail(`canonical Recursus freeze policy drifted: ${JSON.stringify({ missingRules, canonicalSha256 })}`);
}

const routedInstructions = [
  ['lib/AGENTS.md', '../docs/recursus/AGENTS.md'],
  ['scripts/AGENTS.md', '../docs/recursus/AGENTS.md'],
  ['tests/recursus/AGENTS.md', '../../docs/recursus/AGENTS.md'],
  ['evals/recursus/AGENTS.md', '../../docs/recursus/AGENTS.md'],
];
const routingFailures = routedInstructions.filter(([path, target]) => !read(path).includes(target));
if (routingFailures.length === 0) {
  pass('implementation, script, test, and evaluation instruction surfaces route to the freeze policy');
} else {
  fail(`Recursus instruction routing drifted: ${JSON.stringify({ routingFailures })}`);
}

const rootRouteEntrypoints = readdirSync(ROOT)
  .filter((name) => /^(?:prepare|capture|verify)-recursus-route-v\d+\.mjs$/.test(name))
  .sort();
const expectedFrozenEntrypoints = [
  'capture-recursus-route-v16.mjs',
  'prepare-recursus-route-v16.mjs',
  'verify-recursus-route-v16.mjs',
];
if (JSON.stringify(rootRouteEntrypoints) === JSON.stringify(expectedFrozenEntrypoints)) {
  pass('repository root contains only the frozen V16 Recursus route entrypoints');
} else {
  fail(`future Recursus entrypoints must move below scoped instruction paths: ${JSON.stringify(rootRouteEntrypoints)}`);
}
