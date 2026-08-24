#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { main } from './lib/recursus-benchmark.mjs';

export { main };

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
