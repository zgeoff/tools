import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { FileLocks } from './file-locks.ts';
import { parseCacheEntry } from './parse-cache-entry.ts';
import { pickStaleCacheEntries } from './pick-stale-cache-entries.ts';
import type { Clock } from './system-clock.ts';
import type { TemplateFiles } from './template-files.ts';
import { withFileLock } from './with-file-lock.ts';

export interface PerRunTemplateOptions {
  readonly cacheDirectory: string;

  readonly name: string;

  // The files whose content decides the template, so a change to any of them builds a new one.
  readonly inputPaths: readonly string[];

  readonly files: TemplateFiles;

  readonly locks: FileLocks;

  readonly clock: Clock;

  readonly probeProcess: (processID: number) => boolean;

  readonly processID: number;

  readonly writeTemplate: (directory: string) => Promise<void>;
}

// A build that takes longer than this has hung, since a test's own timeout is far shorter.
const lockWaitDeadlineMs = 120_000;

// The first caller to need the template builds it under the cache's lock, and the others wait and
// reuse it. Each caller reads the template under a reader record of its own, so a run with other
// inputs keeps the template until every reader is done with it.
export async function withPerRunTemplate<Result>(
  options: PerRunTemplateOptions,
  readTemplate: (templateDirectory: string) => Promise<Result>,
): Promise<Result> {
  const key = await readInputsKey(options.inputPaths, options.files);

  const templateName = `${options.name}-${key}`;
  const templateDirectory = join(options.cacheDirectory, templateName);

  const readerPath = join(
    options.cacheDirectory,
    `${templateName}.readers`,
    `${options.processID}-${randomUUID()}`,
  );

  await options.files.createDirectories(options.cacheDirectory);

  await withFileLock(
    join(options.cacheDirectory, `${options.name}.lock`),
    { locks: options.locks, clock: options.clock, retryMs: 50, waitDeadlineMs: lockWaitDeadlineMs },
    async () => {
      await removeStaleEntries(options, templateName);

      const entries = await options.files.readDirectoryNames(options.cacheDirectory);

      if (!entries.includes(templateName)) {
        await createTemplate(options, templateDirectory);
      }

      await options.files.createDirectories(
        join(options.cacheDirectory, `${templateName}.readers`),
      );

      await options.files.writeFile(readerPath, '');
    },
  );

  try {
    return await readTemplate(templateDirectory);
  } finally {
    await options.files.removePath(readerPath);
  }
}

async function readInputsKey(inputPaths: readonly string[], files: TemplateFiles): Promise<string> {
  const hash = createHash('sha256');

  for (const path of inputPaths.toSorted()) {
    const content = await files.readFile(path);

    hash.update(`${path}\0`);
    hash.update(content);
    hash.update('\0');
  }

  return hash.digest('hex').slice(0, 16);
}

// A reader record names its process, so the record of a reader that died without its cleanup
// goes, and its template with it.
async function removeStaleEntries(
  options: PerRunTemplateOptions,
  templateName: string,
): Promise<void> {
  const entries = await options.files.readDirectoryNames(options.cacheDirectory);

  const readTemplateNames = new Set<string>();

  for (const entry of entries) {
    const cacheEntry = parseCacheEntry(options.name, entry);

    if (cacheEntry?.kind !== 'readers') {
      continue;
    }

    const readersDirectory = join(options.cacheDirectory, entry);

    const readers = await options.files.readDirectoryNames(readersDirectory);

    const exitedReaders = readers.filter(
      (reader) => !options.probeProcess(Number(reader.split('-')[0])),
    );

    await Promise.all(
      exitedReaders.map((reader) => options.files.removePath(join(readersDirectory, reader))),
    );

    if (exitedReaders.length < readers.length) {
      readTemplateNames.add(cacheEntry.templateName);
    }
  }

  const stale = pickStaleCacheEntries({
    name: options.name,
    templateName,
    entries,
    readTemplateNames,
  });

  await Promise.all(
    stale.map((entry) => options.files.removePath(join(options.cacheDirectory, entry))),
  );
}

// The build goes to a folder of its own and moves into place in one rename, so a reader never
// sees half a template.
async function createTemplate(
  options: PerRunTemplateOptions,
  templateDirectory: string,
): Promise<void> {
  const buildDirectory = `${templateDirectory}.building-${randomUUID()}`;

  await options.files.createDirectories(buildDirectory);
  await options.writeTemplate(buildDirectory);

  const isMoved = await options.files.moveDirectory(buildDirectory, templateDirectory);

  if (!isMoved) {
    throw new Error(`the template ${templateDirectory} appeared while the cache's lock was held`);
  }
}
