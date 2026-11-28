import { accessSync, constants, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTemplatesRoot } from './build-templates-root.ts';
import { readInputsHash } from './read-inputs-hash.ts';
import { removeFolder } from './remove-folder.ts';
import { removeStaleTemplates } from './remove-stale-templates.ts';
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
// in the user's cache folder, so a later run with the same inputs reuses it with no build. However
// many callers ask, one of them builds it. Never write into the folder.
export async function readTemplate(options: ReadTemplateOptions): Promise<string> {
  const staleLockMs = options.staleLockMs ?? defaultStaleLockMs;
  const templatesRoot = createTemplatesRoot();

  removeUnusedTemplatesOnce(templatesRoot);

  const hash = await readInputsHash(options.name, options.root, options.inputs);

  const folder = `${options.name}-${hash}`;
  const template = join(templatesRoot, folder);
  const lockPath = `${template}.lock`;

  for (;;) {
    const lock = takeTemplateLock(lockPath, staleLockMs);

    if (lock === null) {
      await Bun.sleep(pollIntervalMs);

      continue;
    }

    // Marking and checking happen under the lock that a prune takes, so a prune either sees the new
    // mark or runs before it, and a template that exists here stays until the caller has copied it.
    try {
      markUsed(`${template}.used`);

      if (existsSync(template)) {
        return template;
      }

      await createTemplate(template, options.write);
    } finally {
      lock.release();
    }
  }
}

// A home folder that can't hold the cache, such as a read-only one, leaves it in the OS temp folder.
function createTemplatesRoot(): string {
  const preferred = buildTemplatesRoot(process.env, homedir());

  try {
    mkdirSync(preferred, { recursive: true });
    accessSync(preferred, constants.W_OK);

    return preferred;
  } catch {
    const fallback = join(tmpdir(), 'zgeoff-testing-templates');

    mkdirSync(fallback, { recursive: true });

    return fallback;
  }
}

const hourMs = 60 * 60 * 1000;

const prunedRoots = new Set<string>();

const maxUnusedHoursVariable = 'ZGEOFF_TESTING_TEMPLATE_MAX_UNUSED_HOURS';

// Earlier versions kept the cache in the OS temp folder, so each process prunes that folder too.
function removeUnusedTemplatesOnce(templatesRoot: string): void {
  const options = {
    nowMs: Date.now(),
    maxUnusedMs: parseMaxUnusedHours(process.env[maxUnusedHoursVariable]) * hourMs,

    // A holder of another caller sets its own limit, so a prune judges every lock by the default.
    staleLockMs: defaultStaleLockMs,
  };

  for (const root of [templatesRoot, join(tmpdir(), 'zgeoff-testing-templates')]) {
    if (!prunedRoots.has(root)) {
      prunedRoots.add(root);

      removeStaleTemplates(root, options);
    }
  }
}

const defaultMaxUnusedHours = 24;

function parseMaxUnusedHours(value: string | undefined): number {
  if (value === undefined || value === '') {
    return defaultMaxUnusedHours;
  }

  const hours = Number(value);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`${maxUnusedHoursVariable} must be a positive number of hours, not ${value}`);
  }

  return hours;
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
