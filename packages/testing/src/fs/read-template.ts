import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInputsHash } from './read-inputs-hash.ts';
import { removeFolder } from './remove-folder.ts';
import { removeOldTemplates } from './remove-old-templates.ts';
import { takeTemplateLock } from './take-template-lock.ts';

export interface ReadTemplateOptions {
  readonly name: string;

  // The inputs' globs resolve under this folder.
  readonly root: string;

  // A template is reused while the name and each matched file's relative path and contents stay the
  // same.
  readonly inputs: readonly string[];

  // Builds the template into an empty folder.
  readonly write: (directory: string) => Promise<void>;

  // A lock older than this belongs to a dead build. 120 s when it is unset.
  readonly staleLockMs?: number;
}

const defaultStaleLockMs = 120_000;
const pollIntervalMs = 50;

// Resolves with the path of a template folder that every test worker can copy. The template lives
// in one folder under the OS temp folder, so a later run with the same inputs reuses it with no
// build. However many callers ask, one of them builds it. Never write into the folder.
export async function readTemplate(options: ReadTemplateOptions): Promise<string> {
  const staleLockMs = options.staleLockMs ?? defaultStaleLockMs;
  const templatesRoot = join(tmpdir(), 'zgeoff-testing-templates');

  const hash = await readInputsHash(options.name, options.root, options.inputs);

  const folder = `${options.name}-${hash}`;
  const template = join(templatesRoot, folder);
  const lockPath = `${template}.lock`;

  mkdirSync(templatesRoot, { recursive: true });

  for (;;) {
    if (existsSync(template)) {
      markUsed(`${template}.used`);

      return template;
    }

    const lock = takeTemplateLock(lockPath, staleLockMs);

    if (lock === null) {
      await Bun.sleep(pollIntervalMs);

      continue;
    }

    try {
      // A caller that held the lock before this one may have built the template just now.
      if (!existsSync(template)) {
        await createTemplate(template, options.write);

        removeOldTemplates(templatesRoot, options.name, folder, Date.now());
      }
    } finally {
      lock.release();
    }
  }
}

function markUsed(markerPath: string): void {
  writeFileSync(markerPath, String(Date.now()));
}

// Builds into a staging folder, and renames it into place, so no caller sees half a template.
async function createTemplate(
  template: string,
  write: (directory: string) => Promise<void>,
): Promise<void> {
  const staging = `${template}.staging-${process.pid}-${crypto.randomUUID()}`;

  mkdirSync(staging);

  try {
    await write(staging);

    renameSync(staging, template);
  } catch (error) {
    removeFolder(staging);

    // A build that lost its lock to a takeover can find the template already in place.
    if (!existsSync(template)) {
      throw error;
    }
  }
}
