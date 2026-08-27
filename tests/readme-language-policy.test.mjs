// Only English READMEs are maintained. A closed allowlist makes every new
// README an explicit review decision instead of silently admitting a document
// the maintainers cannot verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ENGLISH_READMES = [
  'README.md',
  'batch/README.md',
  'dashboard/README.md',
  'docs/recursus/README.md',
  'docs/recursus/architecture/README.md',
  'docs/recursus/benchmarks/README.md',
  'docs/recursus/features/README.md',
  'documents/README.md',
  'evals/README.md',
  'evals/recursus/README.md',
  'evals/recursus/rc2-claude-code-reference-v1/README.md',
  'evals/recursus/rc2-claude-code-reference-v2/README.md',
  'evals/recursus/rc2-claude-code-reference-v3/README.md',
  'evals/recursus/rc2-claude-code-reference-v4/README.md',
  'evals/recursus/rc3-recursus-direct-v1/README.md',
  'evals/recursus/rc3-recursus-direct-v10/README.md',
  'evals/recursus/rc3-recursus-direct-v11/README.md',
  'evals/recursus/rc3-recursus-direct-v12/README.md',
  'evals/recursus/rc3-recursus-direct-v13/README.md',
  'evals/recursus/rc3-recursus-direct-v14/README.md',
  'evals/recursus/rc3-recursus-direct-v15/README.md',
  'evals/recursus/rc3-recursus-direct-v16/README.md',
  'evals/recursus/rc3-recursus-direct-v17/README.md',
  'evals/recursus/rc3-recursus-direct-v2/README.md',
  'evals/recursus/rc3-recursus-direct-v3/README.md',
  'evals/recursus/rc3-recursus-direct-v4/README.md',
  'evals/recursus/rc3-recursus-direct-v5/README.md',
  'evals/recursus/rc3-recursus-direct-v6/README.md',
  'evals/recursus/rc3-recursus-direct-v7/README.md',
  'evals/recursus/rc3-recursus-direct-v8/README.md',
  'evals/recursus/rc3-recursus-direct-v9/README.md',
  'evals/recursus/rc4-prompt-context-v1/README.md',
  'evals/recursus/rc4-prompt-context-v2/README.md',
  'examples/README.md',
  'examples/dual-track-engineer-instructor/README.md',
  'examples/latex-tex/README.md',
  'interview-prep/sessions/README.md',
  'modes/README.md',
  'modes/interview/README.md',
  'plugins/README.md',
  'plugins/_template/README.md',
  'providers/README.md',
  'scaffolder/README.md',
  'seeds/README.md',
  'templates/README.md',
  'tests/README.md',
  'web/README.md',
  'writing-samples/README.md',
].sort();

function trackedReadmesOnDisk() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf-8' })
    .split('\0')
    .filter(Boolean)
    .filter((path) => /^README(?:\..+)?\.md$/i.test(basename(path)))
    .filter((path) => {
      const fullPath = join(ROOT, path);
      return existsSync(fullPath) && statSync(fullPath).isFile();
    })
    .sort();
}

test('the repository contains only reviewed English READMEs', () => {
  assert.deepEqual(
    trackedReadmesOnDisk(),
    ENGLISH_READMES,
    'README policy changed. Non-English READMEs are not accepted; review any new English README and add its path to the allowlist.',
  );
});
