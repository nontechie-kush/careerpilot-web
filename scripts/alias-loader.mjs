/**
 * Node.js ESM custom loader — maps @/ imports to src/
 * Also appends .js extension when missing (required for strict ESM).
 *
 * Usage:
 *   node --experimental-loader ./scripts/alias-loader.mjs scripts/run-scrapers.mjs
 */

import { fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = pathResolve(__dirname, '../src');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let filePath = pathResolve(SRC_ROOT, specifier.slice(2));
    // Node ESM requires explicit extensions — append .js if missing
    if (!extname(filePath)) filePath += '.js';
    return nextResolve(filePath, context);
  }
  return nextResolve(specifier, context);
}
