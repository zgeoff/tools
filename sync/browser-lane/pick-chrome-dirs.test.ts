import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildBrowserRun } from './build-browser-run.ts';
import { pickChromeDirs } from './pick-chrome-dirs.ts';

function setupTest() {
  return { notesRun: buildBrowserRun('/work/notes-app', 'build-box', '4417') };
}

test("it keeps Chrome's temp folder in TMPDIR, under a folder of the user's own, when its socket path fits", () => {
  const ctx = setupTest();
  const chromeDirs = pickChromeDirs('/var/tmp', 1000, ctx.notesRun);

  expect(chromeDirs.privateDir).toBe('/var/tmp/browser-lane-chrome-1000');
  expect(chromeDirs.runDir).toBe(join(chromeDirs.runsDir, '4417'));
  expect(chromeDirs.runsDir).toMatch(/^\/var\/tmp\/browser-lane-chrome-1000\/[\da-f]{8}$/u);
});

test("it gives each repo and host name its own folder for Chrome's temp folders", () => {
  const ctx = setupTest();
  const notesDirs = pickChromeDirs('/var/tmp', 1000, ctx.notesRun);

  const otherRepoDirs = pickChromeDirs(
    '/var/tmp',
    1000,
    buildBrowserRun('/work/billing-app', 'build-box', '4417'),
  );

  const otherHostDirs = pickChromeDirs(
    '/var/tmp',
    1000,
    buildBrowserRun('/work/notes-app', 'dev-container', '4417'),
  );

  const sameRepoDirs = pickChromeDirs(
    '/var/tmp',
    1000,
    buildBrowserRun('/work/notes-app', 'build-box', '5120'),
  );

  expect(otherRepoDirs.runsDir).not.toBe(notesDirs.runsDir);
  expect(otherHostDirs.runsDir).not.toBe(notesDirs.runsDir);
  expect(sameRepoDirs.runsDir).toBe(notesDirs.runsDir);
});

test("it keeps Chrome's temp folder in a TMPDIR whose socket path takes the last of the 107 bytes", () => {
  const ctx = setupTest();
  const tmpdir = `/${'d'.repeat(22)}`;
  const chromeDirs = pickChromeDirs(tmpdir, 1000, ctx.notesRun);

  expect(`${chromeDirs.runDir}/org.chromium.Chromium.XXXXXX/SingletonSocket`).toHaveLength(107);
  expect(chromeDirs.privateDir).toBe(`${tmpdir}/browser-lane-chrome-1000`);
});

test("it moves Chrome's temp folder to /tmp when the socket path in TMPDIR passes 107 bytes", () => {
  const ctx = setupTest();
  const tmpdir = `/${'d'.repeat(23)}`;
  const chromeDirs = pickChromeDirs(tmpdir, 1000, ctx.notesRun);
  const preferredDirs = pickChromeDirs('/var/tmp', 1000, ctx.notesRun);

  expect(chromeDirs.privateDir).toBe('/tmp/browser-lane-chrome-1000');
  expect(chromeDirs.runDir).toBe(preferredDirs.runDir.replace('/var/tmp/', '/tmp/'));
});
