import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// Bun's skipIf takes a boolean at collection time, so the modes this host supports are probed once
// here: a GitHub runner has the systemd-sudo mode, a root shell without systemd the cgroupfs one.
const modesOutput =
  await $`bash ${fileURLToPath(new URL('run-memory-capped.sh', import.meta.url))} --modes`.text();

function setupTest() {
  const scriptPath = fileURLToPath(new URL('run-memory-capped.sh', import.meta.url));

  // systemd-run --user reaches the user manager through XDG_RUNTIME_DIR, so the run keeps this
  // process's environment, minus the two variables that change what the script does.
  const env = { ...process.env, MEMORY_CAP_MODE: '', GITHUB_ACTIONS: '' };

  return { scriptPath, env, bun: process.execPath };
}

test.skipIf(!modesOutput.includes('systemd-sudo'))(
  'it passes a run under its cap with sudo systemd-run',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'systemd-sudo' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(
        /^run-memory-capped: systemd-sudo, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills 0\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-sudo'))(
  'it fails a run over its cap with sudo systemd-run',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(256 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'systemd-sudo' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr: expect.stringMatching(
        /^run-memory-capped: systemd-sudo, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills [1-9]\d*\nrun-memory-capped: the command went over its memory cap, and the kernel OOM-killed a process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-user'))(
  'it passes a run under its cap with systemd-run --user',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'systemd-user' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(
        /^run-memory-capped: systemd-user, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills 0\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-user'))(
  'it fails a run over its cap with systemd-run --user',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(256 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'systemd-user' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr: expect.stringMatching(
        /^run-memory-capped: systemd-user, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills [1-9]\d*\nrun-memory-capped: the command went over its memory cap, and the kernel OOM-killed a process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it passes a run under its cap with a cgroup it writes itself',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'cgroupfs' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(
        /^run-memory-capped: cgroupfs, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills 0\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it fails a run over its cap with a cgroup it writes itself',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(256 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, MEMORY_CAP_MODE: 'cgroupfs' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr: expect.stringMatching(
        /^run-memory-capped: cgroupfs, memory.max 128 MiB, memory.swap.max (?:0 MiB|absent)\nrun-memory-capped: peak anon memory \d+ MiB, sampled every 200 ms; memory.peak (?:\d+ MiB|absent)\nrun-memory-capped: OOM kills [1-9]\d*\nrun-memory-capped: the command went over its memory cap, and the kernel OOM-killed a process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it runs the command in a cgroup of its own, which it removes once the run ends',
  async () => {
    const ctx = setupTest();

    const result = await $`bash ${ctx.scriptPath} 128 cat /proc/self/cgroup`
      .env({ ...ctx.env, MEMORY_CAP_MODE: 'cgroupfs' })
      .quiet();

    const cgroup = result.stdout.toString().replace(/^0::/u, '').trim();

    expect(cgroup).toMatch(/\/run-memory-capped-\d+$/u);
    expect(existsSync(join('/sys/fs/cgroup', cgroup))).toBeFalse();
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it stops the command, reports, and removes its cgroup when it gets SIGTERM',
  async () => {
    const ctx = setupTest();

    const run = Bun.spawn(
      [
        'bash',
        ctx.scriptPath,
        '128',
        'bash',
        '-c',
        'echo $$; cat /proc/self/cgroup; exec sleep 30',
      ],
      { env: { ...ctx.env, MEMORY_CAP_MODE: 'cgroupfs' }, stdout: 'pipe', stderr: 'pipe' },
    );

    onTestFinished(() => {
      run.kill('SIGKILL');
    });

    const reader = run.stdout.getReader();

    const decoder = new TextDecoder();

    let started = '';

    // The command prints its pid and cgroup before it sleeps, so a signal after both lines reaches
    // a running command.
    while (started.split('\n').length < 3) {
      const chunk = await reader.read();

      invariant(!chunk.done);

      started += decoder.decode(chunk.value);
    }

    run.kill('SIGTERM');

    const exitCode = await run.exited;

    const stderr = await new Response(run.stderr).text();

    const [pid, cgroup] = started.split('\n');

    invariant(pid !== undefined && cgroup !== undefined);

    const cgroupPath = join('/sys/fs/cgroup', cgroup.replace(/^0::/u, ''));

    expect(exitCode).toBe(143);
    expect(stderr).toInclude('run-memory-capped: OOM kills 0\n');
    expect(existsSync(`/proc/${pid}`)).toBeFalse();
    expect(existsSync(cgroupPath)).toBeFalse();
  },
);

test.skipIf(modesOutput === '')('it uses the first mode the host supports', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const [firstMode] = modes.split('\n');

  invariant(firstMode !== undefined);

  const result = await $`bash ${ctx.scriptPath} 128 true`.env(ctx.env).nothrow().quiet();

  expect(result.stderr.toString()).toStartWith(`run-memory-capped: ${firstMode}, `);
});

test.skipIf(modesOutput === '')(
  'it marks the OOM kill as an error annotation in GitHub Actions',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${'Buffer.alloc(256 * 1024 * 1024, 1)'}`
        .env({ ...ctx.env, GITHUB_ACTIONS: 'true' })
        .nothrow()
        .quiet();

    expect(result.stderr.toString()).toEndWith(
      '::error::run-memory-capped: the command went over its memory cap, and the kernel OOM-killed a process\n',
    );
  },
);

test('it fails with the command exit status when the command fails under its cap', async () => {
  const ctx = setupTest();

  const result = await $`bash ${ctx.scriptPath} 128 bash -c ${'exit 3'}`
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(3);
});

test('it runs the command uncapped with a warning when MEMORY_CAP_MODE is none', async () => {
  const ctx = setupTest();

  const result =
    await $`bash ${ctx.scriptPath} 128 ${ctx.bun} -e ${"Buffer.alloc(192 * 1024 * 1024, 1); console.log('done')"}`
      .env({ ...ctx.env, MEMORY_CAP_MODE: 'none' })
      .nothrow()
      .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'done\n',
    stderr:
      'run-memory-capped: this host has no systemd scope and no writable cgroup v2 parent for a memory cap, so the command runs uncapped\n',
  });
});

test.skipIf(modesOutput.split('\n').length > 3)('it refuses a mode the host lacks', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const missingMode = ['systemd-sudo', 'systemd-user', 'cgroupfs'].find(
    (mode) => !modes.split('\n').includes(mode),
  );

  invariant(missingMode !== undefined);

  const result = await $`bash ${ctx.scriptPath} 128 true`
    .env({ ...ctx.env, MEMORY_CAP_MODE: missingMode })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `run-memory-capped: MEMORY_CAP_MODE is ${missingMode}, which this host does not support; it supports: ${modes.replaceAll('\n', ' ')}none\n`,
  });
});

test('it refuses a mode it does not know', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const result = await $`bash ${ctx.scriptPath} 128 true`
    .env({ ...ctx.env, MEMORY_CAP_MODE: 'docker' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `run-memory-capped: MEMORY_CAP_MODE is docker, which this host does not support; it supports: ${modes.replaceAll('\n', ' ')}none\n`,
  });
});

test.each([
  ['a cap that is not a whole number', ['1.5G', 'true']],
  ['a cap of zero', ['0', 'true']],
  ['no command', ['128']],
])('it prints the usage and exits 2 for %s', async (_label, args) => {
  const ctx = setupTest();

  const result = await $`bash ${ctx.scriptPath} ${args}`.env(ctx.env).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'usage: run-memory-capped.sh <MiB> <command> [args...]\n       run-memory-capped.sh --modes\n',
  });
});
