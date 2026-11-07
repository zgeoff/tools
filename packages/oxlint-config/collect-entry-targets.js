import { resolve } from 'node:path';

export default function collectEntryTargets(directory, manifest) {
  const targets = [
    manifest.main,
    manifest.module,
    ...collectStringLeaves(manifest.bin),
    ...collectStringLeaves(manifest.exports),
    ...Object.values(manifest.scripts ?? {}).flatMap((script) => collectScriptPaths(script)),
  ];

  return new Set(
    targets
      .filter((target) => typeof target === 'string' && !target.includes('*'))
      .map((target) => resolve(directory, target)),
  );
}

function collectStringLeaves(value) {
  if (typeof value === 'string') {
    return [value];
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.values(value).flatMap((leaf) => collectStringLeaves(leaf));
}

function collectScriptPaths(script) {
  if (typeof script !== 'string') {
    return [];
  }

  return script
    .split(/\s+/u)
    .map((word) => word.replaceAll(/["']/gu, ''))
    .map((word) => word.slice(word.lastIndexOf('=') + 1))
    .filter((word) => word !== '');
}
