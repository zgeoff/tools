import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { readStreamUntil } from '../../test-utils/read-stream-until.ts';

// Bun's skipIf takes a boolean at collection time, so the modes this host supports are probed once
// here: a GitHub runner has the systemd-sudo mode, a root shell without systemd the cgroupfs one.
const modesOutput = await $`bash ${join(import.meta.dir, 'diet.sh')} --modes`.text();

// memory.peak needs Linux 5.19, and the root cgroup never has one, so the probe reads this
// process's own cgroup.
const membership = await readFile('/proc/self/cgroup', 'utf8');

const hasMemoryPeak = existsSync(
  join('/sys/fs/cgroup', membership.replace(/^0::/u, '').trim(), 'memory.peak'),
);

function setupTest() {
  const scriptPath = join(import.meta.dir, 'diet.sh');

  // systemd-run --user reaches the user manager through XDG_RUNTIME_DIR, so the run keeps this
  // process's environment, minus the two variables that change what diet does.
  const env = { ...process.env, DIET_MODE: '', GITHUB_ACTIONS: '' };

  return { scriptPath, env, bun: process.execPath };
}

test.skipIf(modesOutput === '')(
  'it fails a command that allocates more than its budget, and reports the OOM kill',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${"Buffer.alloc(128 * 1024 * 1024, 1); console.log('done')"}`
        .env(ctx.env)
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
        /^diet: peaked at \d+(?:\.\d)? [KMG]?B of 64 MB\ndiet: the command went over its 64 MB budget, and the kernel OOM-killed 1 process\n$/u,
      ),
    });
  },
);

test.skipIf(modesOutput === '')(
  'it passes a command under its budget, and reports its peak',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 256M -- ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env(ctx.env)
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(/^diet: peaked at \d+(?:\.\d)? [KMG]?B of 256 MB\n$/u),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-sudo'))(
  'it passes a run under its budget with sudo systemd-run',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 128M -- ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'systemd-sudo' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(/^diet: peaked at \d+(?:\.\d)? [KMG]?B of 128 MB\n$/u),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-sudo'))(
  'it hands the command the TMPDIR it started with under sudo systemd-run',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 128M -- ${ctx.bun} -e ${'console.log(process.env.TMPDIR)'}`
        .env({ ...ctx.env, DIET_MODE: 'systemd-sudo', TMPDIR: '/var/tmp/diet-kiln' })
        .nothrow()
        .quiet();

    expect(result.stdout.toString()).toBe('/var/tmp/diet-kiln\n');
  },
);

test.skipIf(!modesOutput.includes('systemd-sudo'))(
  'it fails a run over its budget with sudo systemd-run',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${"Buffer.alloc(128 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'systemd-sudo' })
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
        /^diet: peaked at \d+(?:\.\d)? [KMG]?B of 64 MB\ndiet: the command went over its 64 MB budget, and the kernel OOM-killed 1 process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-user'))(
  'it passes a run under its budget with systemd-run --user',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 128M -- ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'systemd-user' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(/^diet: peaked at \d+(?:\.\d)? [KMG]?B of 128 MB\n$/u),
    });
  },
);

test.skipIf(!modesOutput.includes('systemd-user'))(
  'it fails a run over its budget with systemd-run --user',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${"Buffer.alloc(128 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'systemd-user' })
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
        /^diet: peaked at \d+(?:\.\d)? [KMG]?B of 64 MB\ndiet: the command went over its 64 MB budget, and the kernel OOM-killed 1 process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it passes a run under its budget with a cgroup it writes itself',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 128M -- ${ctx.bun} -e ${"Buffer.alloc(16 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'cgroupfs' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 0,
      stdout: 'done\n',
      stderr: expect.stringMatching(/^diet: peaked at \d+(?:\.\d)? [KMG]?B of 128 MB\n$/u),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it fails a run over its budget with a cgroup it writes itself',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${"Buffer.alloc(128 * 1024 * 1024, 1); console.log('done')"}`
        .env({ ...ctx.env, DIET_MODE: 'cgroupfs' })
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
        /^diet: peaked at \d+(?:\.\d)? [KMG]?B of 64 MB\ndiet: the command went over its 64 MB budget, and the kernel OOM-killed 1 process\n$/u,
      ),
    });
  },
);

test.skipIf(!modesOutput.includes('cgroupfs'))(
  'it runs the command in a cgroup of its own, which it removes once the run ends',
  async () => {
    const ctx = setupTest();

    const result = await $`bash ${ctx.scriptPath} --budget 128M -- cat /proc/self/cgroup`
      .env({ ...ctx.env, DIET_MODE: 'cgroupfs' })
      .quiet();

    const cgroup = result.stdout.toString().replace(/^0::/u, '').trim();

    expect(cgroup).toMatch(/\/diet-\d+$/u);
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
        '--budget',
        '128M',
        '--',
        'bash',
        '-c',
        'echo $$; cat /proc/self/cgroup; echo started; exec sleep 30',
      ],
      {
        env: { ...ctx.env, DIET_MODE: 'cgroupfs' },
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
      },
    );

    // A test that fails before its signal lands leaves the command and the sampler running, so the
    // cleanup stops the whole process group, which detached gives the run.
    onTestFinished(() => {
      Bun.spawnSync(['kill', '-KILL', '--', `-${run.pid}`]);
    });

    // The command prints its pid and cgroup before it sleeps, so a signal after both lines reaches
    // a running command.
    const started = await readStreamUntil(run.stdout, 'started\n');

    run.kill('SIGTERM');

    const exitCode = await run.exited;

    const stderr = await new Response(run.stderr).text();

    const [pid, cgroup] = started.split('\n');

    invariant(pid !== undefined && cgroup !== undefined);

    const cgroupPath = join('/sys/fs/cgroup', cgroup.replace(/^0::/u, ''));

    expect({
      exitCode,
      stderr,
      commandRunning: existsSync(`/proc/${pid}`),
      cgroupPresent: existsSync(cgroupPath),
    }).toStrictEqual({
      exitCode: 143,
      stderr: expect.stringMatching(/^diet: peaked at \d+(?:\.\d)? [KMG]?B of 128 MB\n$/u),
      commandRunning: false,
      cgroupPresent: false,
    });
  },
);

test.each([['SIGHUP'], ['SIGINT'], ['SIGTERM']] as const)(
  'it hands a %s it gets to the command as the same signal',
  async (signal) => {
    const ctx = setupTest();
    const name = signal.slice('SIG'.length);

    const run = Bun.spawn(
      [
        'bash',
        ctx.scriptPath,
        '--budget',
        '128M',
        '--',
        ctx.bun,
        '-e',
        `process.on('${signal}', () => { console.log('got ${name}'); process.exit(0); }); console.log('ready'); setInterval(() => {}, 1000);`,
      ],
      { env: ctx.env, stdout: 'pipe', stderr: 'pipe', detached: true },
    );

    // A test that fails before its signal lands leaves the command and the sampler running, so the
    // cleanup stops the whole process group, which detached gives the run.
    onTestFinished(() => {
      Bun.spawnSync(['kill', '-KILL', '--', `-${run.pid}`]);
    });

    // The command prints ready once its handler is set, so a signal after that line reaches it. A bash
    // command would defer its trap until a blocking read returns.
    const ready = await readStreamUntil(run.stdout, 'ready\n');

    run.kill(signal);

    const rest = await readStreamUntil(run.stdout, `got ${name}\n`);

    const output = `${ready}${rest}`;

    const exitCode = await run.exited;

    expect({ exitCode, stdout: output }).toStrictEqual({
      exitCode: 0,
      stdout: `ready\ngot ${name}\n`,
    });
  },
);

test.skipIf(modesOutput === '' || !hasMemoryPeak)(
  'it reports the memory.peak of a run the kernel OOM-killed, above the sampled peak',
  async () => {
    const ctx = setupTest();

    // The allocation reaches the cap well inside one 200 ms sample interval, so the sampled peak
    // stays below it.
    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${'Buffer.alloc(128 * 1024 * 1024, 1)'}`
        .env(ctx.env)
        .nothrow()
        .quiet();

    expect(result.stderr.toString()).toStartWith('diet: peaked at 64 MB of 64 MB\n');
  },
);

test.skipIf(modesOutput === '')(
  'it reports a peak that holds the memory the command used',
  async () => {
    const ctx = setupTest();

    // The command holds its 96 MiB for three sample intervals, so a sample lands while it does.
    const result =
      await $`bash ${ctx.scriptPath} --budget 256M -- ${ctx.bun} -e ${'const held = Buffer.alloc(96 * 1024 * 1024, 1); await Bun.sleep(600); console.log(held.length);'}`
        .env(ctx.env)
        .quiet();

    const peak = /peaked at (?<size>[\d.]+) MB/u.exec(result.stderr.toString())?.groups?.['size'];

    invariant(peak !== undefined);

    expect(Number(peak)).toBeGreaterThanOrEqual(96);
  },
);

test.skipIf(modesOutput === '')(
  'it takes the tightest cgroup cap above it as the default budget',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 300M -- bash ${ctx.scriptPath} -- ${ctx.bun} -e ${"console.log('done')"}`
        .env(ctx.env)
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
        /^diet: peaked at \d+(?:\.\d)? [KMG]?B of 300 MB\ndiet: peaked at \d+(?:\.\d)? [KMG]?B of 300 MB\n$/u,
      ),
    });
  },
);

test.skipIf(modesOutput === '')(
  'it reports a budget that is not a whole number of its unit to one decimal place',
  async () => {
    const ctx = setupTest();

    const result = await $`bash ${ctx.scriptPath} --budget 1536M -- true`
      .env(ctx.env)
      .nothrow()
      .quiet();

    expect(result.stderr.toString()).toMatch(/ of 1\.5 GB\n$/u);
  },
);

test.skipIf(modesOutput === '')(
  'it reports the largest budget it takes without wrapping it',
  async () => {
    const ctx = setupTest();

    const result = await $`bash ${ctx.scriptPath} --budget 8589934591G -- true`
      .env(ctx.env)
      .nothrow()
      .quiet();

    expect(result.stderr.toString()).toMatch(/ of 8589934591 GB\n$/u);
  },
);

test.skipIf(modesOutput === '')('it uses the first mode the host supports', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const [firstMode] = modes.split('\n');

  invariant(firstMode !== undefined);

  const cgroupPatterns: Readonly<Record<string, RegExp>> = {
    'systemd-sudo': /^0::\/system\.slice\/diet-\d+\.scope\n$/u,
    'systemd-user': /^0::\/user\.slice\/.*\/user@\d+\.service\/.*\/diet-\d+\.scope\n$/u,
    cgroupfs: /^0::\/(?:.*\/)?diet-\d+\n$/u,
  };

  const result = await $`bash ${ctx.scriptPath} --budget 128M -- cat /proc/self/cgroup`
    .env(ctx.env)
    .quiet();

  expect(result.stdout.toString()).toMatch(cgroupPatterns[firstMode] ?? /^$/u);
});

test.skipIf(modesOutput === '')(
  'it marks the OOM kill as an error annotation in GitHub Actions',
  async () => {
    const ctx = setupTest();

    const result =
      await $`bash ${ctx.scriptPath} --budget 64M -- ${ctx.bun} -e ${'Buffer.alloc(128 * 1024 * 1024, 1)'}`
        .env({ ...ctx.env, GITHUB_ACTIONS: 'true' })
        .nothrow()
        .quiet();

    expect(result.stderr.toString()).toEndWith(
      '::error::diet: the command went over its 64 MB budget, and the kernel OOM-killed 1 process\n',
    );
  },
);

test('it fails with the command exit status when the command fails under its budget', async () => {
  const ctx = setupTest();

  const result = await $`bash ${ctx.scriptPath} --budget 128M -- bash -c ${'exit 3'}`
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(3);
});

test('it runs the command uncapped with a warning when DIET_MODE is none', async () => {
  const ctx = setupTest();

  const result =
    await $`bash ${ctx.scriptPath} --budget 8M -- ${ctx.bun} -e ${"Buffer.alloc(32 * 1024 * 1024, 1); console.log('done')"}`
      .env({ ...ctx.env, DIET_MODE: 'none' })
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
      'diet: this host has no systemd scope and no writable cgroup v2 parent for a memory cap, so the command runs uncapped\n',
  });
});

test.skipIf(modesOutput.split('\n').length > 3)('it refuses a mode the host lacks', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const missingMode = ['systemd-sudo', 'systemd-user', 'cgroupfs'].find(
    (mode) => !modes.split('\n').includes(mode),
  );

  invariant(missingMode !== undefined);

  const result = await $`bash ${ctx.scriptPath} --budget 128M -- true`
    .env({ ...ctx.env, DIET_MODE: missingMode })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `diet: DIET_MODE is ${missingMode}, which this host does not support; it supports: ${modes.replaceAll('\n', ' ')}none\n`,
  });
});

test('it refuses a mode it does not know', async () => {
  const ctx = setupTest();

  const modes = await $`bash ${ctx.scriptPath} --modes`.env(ctx.env).text();

  const result = await $`bash ${ctx.scriptPath} --budget 128M -- true`
    .env({ ...ctx.env, DIET_MODE: 'docker' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `diet: DIET_MODE is docker, which this host does not support; it supports: ${modes.replaceAll('\n', ' ')}none\n`,
  });
});

test.each([['1'], ['7M']])('it refuses a budget of %s, which leaves diet no room', async (size) => {
  const ctx = setupTest();

  const result = await $`bash ${ctx.scriptPath} --budget ${size} -- true`
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'diet: a budget under 8 MB leaves no room for diet itself\n',
  });
});

test.each([
  ['a budget that is not a whole number', ['--budget', '1.5G', '--', 'true']],
  ['a budget of zero', ['--budget', '0', '--', 'true']],
  ['a budget with an unknown unit', ['--budget', '256MB', '--', 'true']],
  ['a budget that overflows once its unit applies', ['--budget', '17179869184G', '--', 'true']],
  [
    'a budget with more digits than a 64-bit count holds',
    ['--budget', '99999999999999999999', '--', 'true'],
  ],
  ['a budget flag with no size', ['--budget']],
  ['no -- before the command', ['true']],
  ['no command', ['--']],
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
    stderr: 'usage: diet [--budget <size>] -- <command> [args...]\n       diet --modes\n',
  });
});
