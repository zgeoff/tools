import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from './config-error.ts';
import { loadConfig } from './load-config.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'load-config-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it turns no check off when the repo has no config file', async () => {
  const ctx = await setupTest();

  expect(loadConfig(ctx.dir, ['shell'])).toStrictEqual({ off: new Map() });
});

test('it turns a check off with the reason the entry gives', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell', reason: 'the scripts are vendored' }] }),
  );

  expect(loadConfig(ctx.dir, ['shell'])).toStrictEqual({
    off: new Map([['shell', 'the scripts are vendored']]),
  });
});

test.each([
  [
    'an entry with no reason',
    { off: [{ check: 'shell' }] },
    'zgeoff-check.json: off[0] turns off shell with no reason; give one in reason',
  ],
  [
    'an entry with a blank reason',
    { off: [{ check: 'shell', reason: '  ' }] },
    'zgeoff-check.json: off[0] turns off shell with no reason; give one in reason',
  ],
  [
    'an entry that names an unknown check',
    { off: [{ check: 'spelling', reason: 'the docs are generated' }] },
    'zgeoff-check.json: off[0] names no known check; the checks are shell',
  ],
  [
    'an entry with an unknown key',
    { off: [{ check: 'shell', reason: 'the scripts are vendored', until: '2027' }] },
    'zgeoff-check.json: off[0] has an unknown key until',
  ],
  [
    'a check turned off twice',
    {
      off: [
        { check: 'shell', reason: 'the scripts are vendored' },
        { check: 'shell', reason: 'the scripts are vendored' },
      ],
    },
    'zgeoff-check.json: off[1] turns off shell a second time',
  ],
  ['an unknown top-level key', { on: [] }, 'zgeoff-check.json: unknown key on'],
  [
    'an off value that is not a list',
    { off: { shell: 'the scripts are vendored' } },
    'zgeoff-check.json: off must be a list of { "check", "reason" } entries',
  ],
  ['a file that holds a list', [], 'zgeoff-check.json: the file must hold an object'],
])('it rejects %s', async (_label, config, message) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'zgeoff-check.json'), JSON.stringify(config));

  expect(() => loadConfig(ctx.dir, ['shell'])).toThrowWithMessage(ConfigError, message);
});

test('it rejects a file that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'zgeoff-check.json'), '{ off: ');

  expect(() => loadConfig(ctx.dir, ['shell'])).toThrowWithMessage(
    ConfigError,
    /^zgeoff-check\.json: /u,
  );
});
