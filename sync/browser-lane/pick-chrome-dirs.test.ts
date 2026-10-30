import { expect, test } from 'bun:test';
import { buildBrowserRun } from './build-browser-run.ts';
import { pickChromeDirs } from './pick-chrome-dirs.ts';

function setupTest() {
  return { notesRun: buildBrowserRun('/work/notes-app', 'build-box', '4417') };
}

test("it keeps Chrome's temp folder in TMPDIR, under a folder of the user's own, when its socket path fits", () => {
  const ctx = setupTest();

  expect(pickChromeDirs('/var/tmp', 1000, ctx.notesRun)).toStrictEqual({
    privateDir: '/var/tmp/browser-lane-chrome-1000',
    runDir: '/var/tmp/browser-lane-chrome-1000/4417',
  });
});

test("it keeps Chrome's temp folder in a TMPDIR whose socket path takes the last of the 107 bytes", () => {
  const ctx = setupTest();
  const tmpdir = `/${'d'.repeat(31)}`;
  const chromeDirs = pickChromeDirs(tmpdir, 1000, ctx.notesRun);

  expect(`${chromeDirs.runDir}/org.chromium.Chromium.XXXXXX/SingletonSocket`).toHaveLength(107);
  expect(chromeDirs.privateDir).toBe(`${tmpdir}/browser-lane-chrome-1000`);
});

test("it moves Chrome's temp folder to /tmp when the socket path in TMPDIR passes 107 bytes", () => {
  const ctx = setupTest();
  const tmpdir = `/${'d'.repeat(32)}`;

  expect(pickChromeDirs(tmpdir, 1000, ctx.notesRun)).toStrictEqual({
    privateDir: '/tmp/browser-lane-chrome-1000',
    runDir: '/tmp/browser-lane-chrome-1000/4417',
  });
});
