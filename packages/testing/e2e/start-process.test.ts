import { expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { start } from '../src/process/index.ts';
import { buildProcessFixtureCommand } from '../src/test-utils/build-process-fixture-command.ts';
import { probeProcess } from '../src/test-utils/probe-process.ts';

function setupTest() {
  return { command: buildProcessFixtureCommand() };
}

test('it waits for a url to answer 2xx and hands back the base url and the port', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, { args: ['serve'], ready: { url: '/health' } });

  const response = await fetch(`${program.url}/health`);

  expect(program.url).toBe(`http://127.0.0.1:${program.port}`);

  const actual = await response.text();

  expect(actual).toBe('ok');
});

test('it waits for a stdout line that matches', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, {
    args: ['serve'],
    ready: { stdout: /^listening on \d+$/u },
  });

  expect(program.output()).toContain(`listening on ${program.port}`);
});

test('it polls ready.check until it answers true', async () => {
  const ctx = setupTest();
  const answers = [false, false, true];

  await using program = await start(ctx.command, {
    args: ['mute'],
    ready: { check: () => Promise.resolve(answers.shift() ?? true) },
  });

  expect(answers).toStrictEqual([]);
  expect(program.readyLine).toBeNull();
});

test('it hands back the ready line that matched, and null for a url', async () => {
  const ctx = setupTest();

  await using byLine = await start(ctx.command, {
    args: ['serve'],
    ready: { stdout: 'listening on' },
  });

  await using byURL = await start(ctx.command, { args: ['serve'], ready: { url: '/health' } });

  expect(byLine.readyLine).toBe(`listening on ${byLine.port}`);
  expect(byURL.readyLine).toBeNull();
});

test('it gives the program the port that the caller names', async () => {
  const ctx = setupTest();

  const free = await start(ctx.command, { args: ['mute'] });

  const port = free.port;

  await free.stop();

  await using program = await start(ctx.command, {
    args: ['serve'],
    port,
    ready: { stdout: `listening on ${port}` },
  });

  expect(program.port).toBe(port);
});

test('it hands the picked port to args and env functions, and still sets PORT', async () => {
  const ctx = setupTest();

  await using byArgs = await start(ctx.command, {
    args: (port) => ['echo', `--listen=127.0.0.1:${port}`],
    ready: { stdout: '--listen=' },
  });

  await using byEnv = await start(ctx.command, {
    args: ['env', 'KETTLE_PORT'],
    env: (port) => ({ KETTLE_PORT: `${port}`, PORT: 'ignored' }),
    ready: { stdout: /^\d+$/u },
  });

  expect(byArgs.readyLine).toBe(`--listen=127.0.0.1:${byArgs.port}`);
  expect(byEnv.readyLine).toBe(String(byEnv.port));
});

test('it runs the program in the folder that cwd names', async () => {
  const ctx = setupTest();

  const folder = await realpath(tmpdir());

  await using program = await start(ctx.command, {
    args: ['cwd'],
    cwd: folder,
    ready: { stdout: folder },
  });

  expect(program.readyLine).toBe(folder);
});

test('it starts the program as the leader of its own process group', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, { args: ['mute'] });

  const groupID = Bun.spawnSync(['ps', '-o', 'pgid=', '-p', String(program.pid)])
    .stdout.toString()
    .trim();

  expect(groupID).toBe(String(program.pid));
});

test('it throws with the output when the program exits before it is ready', () => {
  const ctx = setupTest();
  const started = start(ctx.command, { args: ['nonsense'], ready: { url: '/health' } });

  expect(started).rejects.toThrow(
    `${ctx.command.join(' ')} exited before it was ready (exit code 64); its output:\nunknown mode nonsense`,
  );
});

test('it throws and stops the program when it is not ready in the time limit', () => {
  const ctx = setupTest();

  const started = start(ctx.command, {
    args: ['mute'],
    ready: { url: '/health' },
    readyTimeoutMs: 300,
  });

  expect(started).rejects.toThrow(
    `${ctx.command.join(' ')} was not ready after 300 ms (exit code 137)`,
  );
});

test('it stops the program with SIGTERM by default and returns its exit code', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['serve'], ready: { url: '/health' } });
  const actual = await program.stop();

  expect(actual).toBe(0);
});

test('it returns 128 plus the signal number when the signal kills the program', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['mute'] });
  const actual = await program.stop('SIGKILL');

  expect(actual).toBe(137);
});

test('it stops the program with SIGHUP', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['mute'] });
  const actual = await program.stop('SIGHUP');

  expect(actual).toBe(129);
});

test('it stops a child that the program forks when it stops the program', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['fork'], ready: { stdout: /^child \d+$/u } });

  const childPid = Number(program.readyLine?.split(' ')[1]);

  await program.stop();

  expect(probeProcess(childPid)).toBeFalse();
});

test('it kills a program with SIGKILL when its handle is disposed', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['mute'] });

  await program[Symbol.asyncDispose]();

  const actual = await program.stop();

  expect(actual).toBe(137);
});

test('it kills a child that the program forks when its handle is disposed', async () => {
  const ctx = setupTest();

  const program = await start(ctx.command, { args: ['fork'], ready: { stdout: /^child \d+$/u } });

  const childPid = Number(program.readyLine?.split(' ')[1]);

  await program[Symbol.asyncDispose]();

  expect(probeProcess(childPid)).toBeFalse();
});

test('it writes to stdin and reads each reply line by line', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, { args: ['reply'] });

  await program.write('kettle\n');

  const first = await program.waitForLine(/^got /u);

  await program.write('cup\n');

  const second = await program.waitForLine(/^got /u);

  expect([first, second]).toStrictEqual(['got kettle', 'got cup']);
});

test('it reads only the lines after the ready line', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, {
    args: ['echo', 'kettle', 'kettle'],
    ready: { stdout: 'kettle' },
  });

  const actual = await program.waitForLine('kettle');

  expect(actual).toBe('kettle');
  expect(program.output()).toBe('kettle\nkettle\n');
});

test('it throws with the output when no line matches in the time limit', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, { args: ['reply'] });

  await program.write('kettle\n');

  expect(program.waitForLine('cup', { timeoutMs: 300 })).rejects.toThrow(
    `${ctx.command.join(' ')} printed no line that matches cup in 300 ms; its output:\ngot kettle\n`,
  );
});

test('it throws when the program exits before a line matches', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, { args: ['echo', 'kettle'] });

  expect(program.waitForLine('cup')).rejects.toThrow(
    `${ctx.command.join(' ')} exited before it printed a line that matches cup; its output:\nkettle\n`,
  );
});

test('it sends SIGKILL after 5 s when the program ignores the stop signal', async () => {
  const ctx = setupTest();

  await using program = await start(ctx.command, {
    args: ['stubborn'],
    ready: { stdout: 'stubborn' },
  });

  const exitCode = await program.stop();

  expect(exitCode).toBe(137);
}, 10_000);

test('it throws at the time limit when ready.check never settles', async () => {
  const ctx = setupTest();

  const started = start(ctx.command, {
    args: ['mute'],
    ready: {
      check: () =>
        new Promise<boolean>(() => {
          // never settles
        }),
    },
    readyTimeoutMs: 100,
  });

  const failure = await started.then(
    () => null,
    (error: unknown) => error,
  );

  expect(String(failure)).toMatch(/was not ready after 100 ms/u);
});

test('it throws when a slow ready.check answers true after the time limit', async () => {
  const ctx = setupTest();

  const started = start(ctx.command, {
    args: ['mute'],
    ready: {
      check: async () => {
        await Promise.resolve();

        const blockedUntil = Date.now() + 150;

        while (Date.now() < blockedUntil) {
          // blocks the event loop past the deadline
        }

        return true;
      },
    },
    readyTimeoutMs: 50,
  });

  const failure = await started.then(
    () => null,
    (error: unknown) => error,
  );

  expect(String(failure)).toMatch(/was not ready after 50 ms/u);
});
