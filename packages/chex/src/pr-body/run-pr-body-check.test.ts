import { expect, test } from 'bun:test';
import type { PrBodyCommandDeps } from './run-pr-body-check.ts';
import { runPrBodyCommand } from './run-pr-body-check.ts';

function setupTest() {
  const output: string[] = [];
  const errors: string[] = [];
  const factsRequests: string[] = [];

  const buildDeps = (body: string): PrBodyCommandDeps => ({
    readBody: () => body,
    readFacts: (base, head, shas) => {
      factsRequests.push(`${base}..${head} ${shas.join(',')}`);

      return { docFiles: ['README.md'], newestDocChange: undefined, shaStates: {} };
    },
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
  });

  const goodBody = '## Description\n\nA retry budget.\n\n## Checks\n\n- [ ] chex\n';

  return { buildDeps, goodBody, output, errors, factsRequests };
}

test('it exits 0 and prints nothing for a body that passes', () => {
  const ctx = setupTest();
  const exitCode = runPrBodyCommand(['--body-file', 'body.md'], ctx.buildDeps(ctx.goodBody));

  expect({ exitCode, output: ctx.output }).toStrictEqual({ exitCode: 0, output: [] });
});

test('it exits 1 and prints one line per error', () => {
  const ctx = setupTest();

  const exitCode = runPrBodyCommand(
    ['--body-file', 'body.md'],
    ctx.buildDeps('## Summary\n\nText.\n'),
  );

  expect({ exitCode, output: ctx.output.join('').split('\n') }).toStrictEqual({
    exitCode: 1,
    output: [
      'pr-body: Summary: "## Summary" is not an allowed heading; use Description, Next steps, Checks, Verification, in that order, or move the text into Description.',
      'pr-body: Description: the body has no "## Description" section; add one.',
      '',
    ],
  });
});

test('it reads the branch facts, with the hashes the body names, for a base and a head', () => {
  const ctx = setupTest();
  const body = '## Description\n\nText.\n\n## Checks\n\n- [x] Deslop (a1b2c3d)\n';

  const exitCode = runPrBodyCommand(
    ['--body-file', 'body.md', '--base', 'aaa111', '--head', 'bbb222'],
    ctx.buildDeps(body),
  );

  expect({ exitCode, requests: ctx.factsRequests }).toStrictEqual({
    exitCode: 1,
    requests: ['aaa111..bbb222 a1b2c3d'],
  });
});

test('it exits 2 for a base with no head', () => {
  const ctx = setupTest();

  const exitCode = runPrBodyCommand(
    ['--body-file', 'body.md', '--base', 'aaa111'],
    ctx.buildDeps(ctx.goodBody),
  );

  expect(exitCode).toBe(2);
});

test('it exits 2 with no body file', () => {
  const ctx = setupTest();

  expect(runPrBodyCommand([], ctx.buildDeps(ctx.goodBody))).toBe(2);
});

test('it exits 2 when it cannot read the body', () => {
  const ctx = setupTest();

  const exitCode = runPrBodyCommand(['--body-file', 'body.md'], {
    ...ctx.buildDeps(ctx.goodBody),
    readBody: () => {
      throw new Error('no such file');
    },
  });

  expect({ exitCode, errors: ctx.errors }).toStrictEqual({
    exitCode: 2,
    errors: ['pr-body: no such file\n'],
  });
});

test('it prints the body with the chex box ticked for tick-chex --passed', () => {
  const ctx = setupTest();

  const exitCode = runPrBodyCommand(
    ['tick-chex', '--body-file', 'body.md', '--passed'],
    ctx.buildDeps(ctx.goodBody),
  );

  expect({ exitCode, output: ctx.output }).toStrictEqual({
    exitCode: 0,
    output: [ctx.goodBody.replace('- [ ] chex', '- [x] chex')],
  });
});

test('it unticks the chex box for tick-chex --failed', () => {
  const ctx = setupTest();

  runPrBodyCommand(
    ['tick-chex', '--body-file', 'body.md', '--failed'],
    ctx.buildDeps(ctx.goodBody.replace('- [ ] chex', '- [x] chex')),
  );

  expect(ctx.output).toStrictEqual([ctx.goodBody]);
});

test.each([[[]], [['--passed', '--failed']]] as const)(
  'it exits 2 for tick-chex with the flags %j',
  (flags) => {
    const ctx = setupTest();

    const exitCode = runPrBodyCommand(
      ['tick-chex', '--body-file', 'body.md', ...flags],
      ctx.buildDeps(ctx.goodBody),
    );

    expect(exitCode).toBe(2);
  },
);
