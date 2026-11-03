import { expect, test } from 'bun:test';
import { spawnCLI } from '../src/cli/index.ts';
import { buildCLIFixtureCommand } from '../src/test-utils/build-cli-fixture-command.ts';

function setupTest() {
  return { command: buildCLIFixtureCommand() };
}

test('it types into a prompt and reads the reply from the screen', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['prompt'] });

  await cli.screen.findByText('What is your name?');
  await cli.user.type('Ada');
  await cli.user.pressEnter();

  const greeting = await cli.screen.findByText('Hello, Ada!');
  const code = await cli.result;

  expect([greeting, code]).toStrictEqual(['Hello, Ada!', 0]);
});

test('it shows the last frame of a line that the program redraws', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['redraw'] });

  await cli.result;

  expect(cli.screen.text().trim()).toBe('done');
});

test('it reads the hyperlinks that the program prints', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['link'] });

  await cli.result;

  expect(cli.screen.links()).toStrictEqual([
    { text: 'the docs', href: 'https://example.com/docs', params: '' },
  ]);
});

test('it resolves result with the exit code of the program', async () => {
  const ctx = setupTest();

  const cli = await spawnCLI(ctx.command, { args: ['exit', '3'] });
  const code = await cli.result;

  expect([code, cli.exitCode()]).toStrictEqual([3, 3]);
});

test('it reports null as the exit code while the program runs', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['wait'] });

  await cli.screen.findByText('waiting');

  expect(cli.exitCode()).toBeNull();
});

test('it reports 128 plus the signal number when a signal kills the program', async () => {
  const ctx = setupTest();

  const cli = await spawnCLI(ctx.command, { args: ['wait'] });

  await cli.screen.findByText('waiting');

  cli.kill('SIGTERM');

  const actual = await cli.result;

  expect(actual).toBe(143);
});

test('it starts at 80 by 24 and follows a resize', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['size'] });

  await cli.screen.findByText('size 80x24');

  cli.resize(100, 30);

  const actual = await cli.screen.findByText('size 100x30');

  expect(actual).toBe('size 100x30');
});

test('it starts at the size that cols and rows name', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['size'], cols: 120, rows: 40 });

  const actual = await cli.screen.findByText('size 120x40');

  expect(actual).toBe('size 120x40');
});

test('it sends each named key as its terminal code', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['keys'] });

  await cli.screen.findByText('ready');
  await cli.user.press('up');
  await cli.screen.findByText('key 1b5b41');
  await cli.user.press('escape');
  await cli.screen.findByText(/^key 1b$/u);
  await cli.user.press('backspace');

  const actual = await cli.screen.findByText(/^key 7f$/u);

  expect(actual).toBe('key 7f');
});

test('it cancels the program with Ctrl+C', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['keys'] });

  await cli.screen.findByText('ready');
  await cli.user.cancel();

  const actual = await cli.result;

  expect(actual).toBe(130);
});

test('it passes env and cwd to the program, and sets TERM', async () => {
  await using cli = await spawnCLI(['sh', '-c', 'echo "$KETTLE_MODE $TERM $(basename "$PWD")"'], {
    env: { KETTLE_MODE: 'rolling' },
    cwd: '/usr',
  });

  const line = await cli.screen.findByText('rolling xterm-256color usr');

  expect(line).toBe('rolling xterm-256color usr');
});

test('it throws with the screen text when a line never shows up', async () => {
  const ctx = setupTest();

  await using cli = await spawnCLI(ctx.command, { args: ['wait'] });

  await cli.screen.findByText('waiting');

  expect(cli.screen.findByText('never', { timeoutMs: 100 })).rejects.toThrow(
    'the screen:\nwaiting\n',
  );
});

test('it kills a running program when its handle is disposed', async () => {
  const ctx = setupTest();

  const cli = await spawnCLI(ctx.command, { args: ['wait'] });

  await cli.screen.findByText('waiting');
  await cli[Symbol.asyncDispose]();

  expect(cli.exitCode()).toBe(137);
});
