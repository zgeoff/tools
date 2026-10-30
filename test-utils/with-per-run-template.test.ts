import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBlockingStubKit } from './create-blocking-stub-kit.ts';
import { fileLocks } from './file-locks.ts';
import { makeFileWritingStub } from './make-file-writing-stub.ts';
import { makeRejectingStub } from './make-rejecting-stub.ts';
import { makeResolvingStub } from './make-resolving-stub.ts';
import { probeProcess } from './probe-process.ts';
import { systemClock } from './system-clock.ts';
import { templateFiles } from './template-files.ts';
import { withPerRunTemplate } from './with-per-run-template.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'per-run-template-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const cacheDirectory = join(directory, 'cache');
  const inputPath = join(directory, 'index.ts');

  return {
    cacheDirectory,
    inputPath,
    options: {
      cacheDirectory,
      name: 'notes-bundle',
      inputPaths: [inputPath],
      files: templateFiles,
      locks: fileLocks,
      clock: systemClock,
      probeProcess,
      processID: process.pid,
    },
  };
}

test('it builds the template once for callers that need it at the same time, and gives each its folder', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');

  const writeTemplate = makeFileWritingStub('bundle.js', 'built\n');
  const firstReader = makeResolvingStub(undefined);
  const secondReader = makeResolvingStub(undefined);

  await Promise.all([
    withPerRunTemplate({ ...ctx.options, writeTemplate }, firstReader),
    withPerRunTemplate({ ...ctx.options, writeTemplate }, secondReader),
  ]);

  const [templateDirectory] = firstReader.mock.calls[0] ?? [];

  const bundleExists = await Bun.file(join(String(templateDirectory), 'bundle.js')).exists();

  expect(writeTemplate).toHaveBeenCalledOnce();
  expect(secondReader).toHaveBeenCalledExactlyOnceWith(templateDirectory);
  expect(bundleExists).toBeTrue();
});

test('it builds a new template when an input changes, and removes the template of the old content', async () => {
  const ctx = await setupTest();

  const writeTemplate = makeFileWritingStub('bundle.js', 'built\n');
  const oldReader = makeResolvingStub(undefined);
  const newReader = makeResolvingStub(undefined);

  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');
  await withPerRunTemplate({ ...ctx.options, writeTemplate }, oldReader);
  await writeFile(ctx.inputPath, 'export const greeting = "goodbye";\n');
  await withPerRunTemplate({ ...ctx.options, writeTemplate }, newReader);

  const [oldTemplate] = oldReader.mock.calls[0] ?? [];
  const [newTemplate] = newReader.mock.calls[0] ?? [];

  const oldTemplateExists = await Bun.file(join(String(oldTemplate), 'bundle.js')).exists();

  expect(newTemplate).not.toBe(oldTemplate);
  expect(writeTemplate).toHaveBeenCalledTimes(2);
  expect(oldTemplateExists).toBeFalse();
});

test('it keeps the template of a run that still reads it while a run with other inputs builds its own', async () => {
  const ctx = await setupTest();

  const writeTemplate = makeFileWritingStub('bundle.js', 'built\n');
  const firstReader = createBlockingStubKit(undefined);

  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');

  const firstRun = withPerRunTemplate({ ...ctx.options, writeTemplate }, firstReader.stub);

  const [firstTemplate] = await firstReader.firstCall;

  const firstBundle = join(String(firstTemplate), 'bundle.js');

  await writeFile(ctx.inputPath, 'export const greeting = "goodbye";\n');
  await withPerRunTemplate({ ...ctx.options, writeTemplate }, makeResolvingStub(undefined));

  const isKeptWhileRead = await Bun.file(firstBundle).exists();

  firstReader.release();

  await firstRun;
  await withPerRunTemplate({ ...ctx.options, writeTemplate }, makeResolvingStub(undefined));

  const isKeptOnceDone = await Bun.file(firstBundle).exists();

  expect(isKeptWhileRead).toBeTrue();
  expect(isKeptOnceDone).toBeFalse();
});

test('it removes the template of another key whose only reader exited without its cleanup', async () => {
  const ctx = await setupTest();

  const exitedReader = Bun.spawn(['true']);

  await exitedReader.exited;

  const oldTemplate = join(ctx.cacheDirectory, 'notes-bundle-0123456789abcdef');

  await mkdir(`${oldTemplate}.readers`, { recursive: true });
  await mkdir(oldTemplate);
  await writeFile(join(`${oldTemplate}.readers`, `${exitedReader.pid}-leftover`), '');
  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');

  await withPerRunTemplate(
    { ...ctx.options, writeTemplate: makeFileWritingStub('bundle.js', 'built\n') },
    makeResolvingStub(undefined),
  );

  const entries = await readdir(ctx.cacheDirectory);

  expect(
    entries.filter((entry) => entry.startsWith('notes-bundle-0123456789abcdef')),
  ).toStrictEqual([]);
});

test("it removes a failed build's folder, and leaves the entries of other names alone", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.cacheDirectory, 'notes-bundle-0123456789abcdef.building-leftover'), {
    recursive: true,
  });

  await mkdir(join(ctx.cacheDirectory, 'billing-bundle-0123456789abcdef'));
  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');

  await withPerRunTemplate(
    { ...ctx.options, writeTemplate: makeFileWritingStub('bundle.js', 'built\n') },
    makeResolvingStub(undefined),
  );

  const entries = await readdir(ctx.cacheDirectory);

  expect(entries).not.toContain('notes-bundle-0123456789abcdef.building-leftover');
  expect(entries).toContain('billing-bundle-0123456789abcdef');
});

test('it removes its reader record once the reader is done, even when the reader fails', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.inputPath, 'export const greeting = "hello";\n');

  const failure = new Error('the copy failed');

  const run = withPerRunTemplate(
    { ...ctx.options, writeTemplate: makeFileWritingStub('bundle.js', 'built\n') },
    makeRejectingStub(failure),
  );

  const outcome = await run.then(
    () => null,
    (error: unknown) => error,
  );

  const entries = await readdir(ctx.cacheDirectory);

  const readersEntry = entries.find((entry) => entry.endsWith('.readers')) ?? 'missing';

  const readers = await readdir(join(ctx.cacheDirectory, readersEntry));

  expect(outcome).toBe(failure);
  expect(readers).toStrictEqual([]);
});
