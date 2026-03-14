/**
 * Node.js ESM custom loader — maps @/ imports to src/ and adds .js extensions.
 *
 * Two problems it solves:
 *   1. @/ path aliases (Next.js convention) don't resolve in plain Node.js
 *   2. Extensionless relative imports (e.g. './greenhouse') require explicit .js
 *      in strict ESM — Next.js handles this at build time, Node doesn't
 *
 * Usage:
 *   node --experimental-loader ./scripts/alias-loader.mjs scripts/run-scrapers.mjs
 */

import { fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT  = pathResolve(__dirname, '../src');

export function resolve(specifier, context, nextResolve) {
  // 1. Resolve @/ alias → src/
  if (specifier.startsWith('@/')) {
    let filePath = pathResolve(SRC_ROOT, specifier.slice(2));
    if (!extname(filePath)) filePath += '.js';
    return nextResolve(filePath, context);
  }

  // 2. Append .js to extensionless relative imports (./foo → ./foo.js)
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !extname(specifier)) {
    return nextResolve(specifier + '.js', context);
  }

  return nextResolve(specifier, context);
}
