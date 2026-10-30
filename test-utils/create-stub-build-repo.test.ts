import { expect, mock, test } from 'bun:test';
import { buildSteppingClock } from './build-stepping-clock.ts';
import { createStubBuildRepo } from './create-stub-build-repo.ts';
import type { TemplateFiles } from './template-files.ts';
import type { TestProcesses } from './test-processes.ts';

function setupTest(readFile: TemplateFiles['readFile']) {
  const clock = buildSteppingClock();

  return {
    files: {
      createDirectories: mock<TemplateFiles['createDirectories']>(() => Promise.resolve()),
      readFile: mock(readFile),
      writeFile: mock<TemplateFiles['writeFile']>(() => Promise.resolve()),
    },
    processes: {
      readGroupID: mock<TestProcesses['readGroupID']>(() => 5120),
      signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
      probeGroup: mock<TestProcesses['probeGroup']>(() => false),
      now: clock.now,
      sleep: clock.sleep,
    },
  };
}

test("it writes a build:browser script that passes the marker file and the build's process ID file", async () => {
  const ctx = setupTest(() => Promise.reject(new Error('no read expected')));

  await createStubBuildRepo('/work/notes-app', '/work/marker.txt', ctx.processes, ctx.files);

  const [path, text] = ctx.files.writeFile.mock.calls[0] ?? [];
  const manifest: unknown = JSON.parse(text ?? 'null');

  expect(ctx.files.createDirectories).toHaveBeenCalledExactlyOnceWith('/work/notes-app');
  expect(path).toBe('/work/notes-app/package.json');

  expect(manifest).toStrictEqual({
    scripts: {
      'build:browser': expect.stringMatching(
        /'--marker' '\/work\/marker\.txt' '--pid-file' '\/work\/notes-app\/build\.pid'$/u,
      ),
    },
  });
});

test("it sends SIGKILL to the group of the process ID that the build's file holds", async () => {
  const ctx = setupTest(() => Promise.resolve(new TextEncoder().encode('4417')));

  const repo = await createStubBuildRepo(
    '/work/notes-app',
    '/work/marker.txt',
    ctx.processes,
    ctx.files,
  );

  await repo.stop();

  expect(ctx.files.readFile).toHaveBeenCalledExactlyOnceWith('/work/notes-app/build.pid');
  expect(ctx.processes.readGroupID).toHaveBeenCalledExactlyOnceWith(4417);
  expect(ctx.processes.signalGroup).toHaveBeenCalledExactlyOnceWith(5120, 'SIGKILL');
  expect(ctx.processes.probeGroup).toHaveBeenCalledExactlyOnceWith(5120);
});

test('it stops nothing when no build wrote its process ID file', async () => {
  const missing = Object.assign(new Error('no such file'), { code: 'ENOENT' });
  const ctx = setupTest(() => Promise.reject(missing));

  const repo = await createStubBuildRepo(
    '/work/notes-app',
    '/work/marker.txt',
    ctx.processes,
    ctx.files,
  );

  await repo.stop();

  expect(ctx.processes.readGroupID).not.toHaveBeenCalled();
  expect(ctx.processes.signalGroup).not.toHaveBeenCalled();
});

test('it stops nothing when the process of the ID has exited', async () => {
  const ctx = setupTest(() => Promise.resolve(new TextEncoder().encode('4417')));

  ctx.processes.readGroupID.mockReturnValue(null);

  const repo = await createStubBuildRepo(
    '/work/notes-app',
    '/work/marker.txt',
    ctx.processes,
    ctx.files,
  );

  await repo.stop();

  expect(ctx.processes.signalGroup).not.toHaveBeenCalled();
});

test('it fails when it cannot read the process ID file', async () => {
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const ctx = setupTest(() => Promise.reject(denied));

  const repo = await createStubBuildRepo(
    '/work/notes-app',
    '/work/marker.txt',
    ctx.processes,
    ctx.files,
  );

  const failure = await repo.stop().then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBe(denied);
});

test('it fails to read a start that the build never reports', async () => {
  const ctx = setupTest(() => Promise.reject(new Error('no read expected')));

  const repo = await createStubBuildRepo(
    '/work/notes-app',
    '/work/marker.txt',
    ctx.processes,
    ctx.files,
  );

  const failure = await repo
    .readStart(new Response('error: build failed\n').body ?? new ReadableStream())
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(failure).toMatchObject({
    message: 'the stub build never reported its start:\nerror: build failed\n',
  });
});
