import { join } from 'node:path';
import readModuleExports from './read-module-exports.js';
import readPackageManifest from './read-package-manifest.js';
import readTestingKitDirectory from './read-testing-kit-directory.js';

// a run lints many files against one install, so each kit folder is read once
const exportsByKit = new Map();

// maps each exported name to the subpath that exports it, such as `waitFor` to `@zgeoff/testing`;
// `null` when the file's repo does not install the kit
export default function readTestingKitExports(filename) {
  const directory = readTestingKitDirectory(filename);

  if (directory === null) {
    return null;
  }

  if (!exportsByKit.has(directory)) {
    exportsByKit.set(directory, readKitExports(directory));
  }

  return exportsByKit.get(directory);
}

const kitName = '@zgeoff/testing';

function readKitExports(directory) {
  const entries = readPackageManifest(directory).exports;
  const names = new Map();

  if (typeof entries !== 'object' || entries === null) {
    return names;
  }

  for (const [subpath, target] of Object.entries(entries)) {
    const file = pickSourceFile(target);

    if (file !== null) {
      const specifier = subpath === '.' ? kitName : `${kitName}/${subpath.replace(/^\.\//u, '')}`;

      for (const name of readModuleExports(join(directory, file))) {
        if (!names.has(name)) {
          names.set(name, specifier);
        }
      }
    }
  }

  return names;
}

const conditions = ['bun', 'default', 'import'];

// the `types` condition names a declaration file, so the first runtime condition wins
function pickSourceFile(target) {
  if (typeof target === 'string') {
    return target;
  }

  if (typeof target !== 'object' || target === null) {
    return null;
  }

  for (const condition of conditions) {
    const picked = pickSourceFile(target[condition]);

    if (picked !== null) {
      return picked;
    }
  }

  return null;
}
