import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRigConfigSource } from '../packages/oxlint-config/test-utils/build-rig-config-source.ts';
import { buildTimeoutSource } from '../packages/oxlint-config/test-utils/build-timeout-source.ts';
import { createLintTree } from '../packages/oxlint-config/test-utils/create-lint-tree.ts';
import { runLintIn } from '../packages/oxlint-config/test-utils/run-lint-in.ts';
import { readRigLaneLimit } from '../test-utils/read-rig-lane-limit.ts';

test('it holds the limit of a declared lane once, for rig and for the lint rule', async () => {
  const tree = await createLintTree(
    {
      'rig.config.ts': buildRigConfigSource("{ lanes: { kiln: { limit: '15s' } } }"),
      'oven.ts': 'export const heat = 1;\n',
      'oven.kiln.test.ts': buildTimeoutSource(20_000),
    },
    { 'zgeoff/max-test-timeout': 'error' },
  );

  const rigLimitBefore = await readRigLaneLimit(tree, 'kiln');
  const lintBefore = await runLintIn(tree, tree, 'oven.kiln.test.ts');

  await writeFile(
    join(tree, 'rig.config.ts'),
    buildRigConfigSource("{ lanes: { kiln: { limit: '25s' } } }"),
  );

  const rigLimitAfter = await readRigLaneLimit(tree, 'kiln');
  const lintAfter = await runLintIn(tree, tree, 'oven.kiln.test.ts');

  expect(rigLimitBefore).toBe(15_000);
  expect(lintBefore.exitCode).toBe(1);

  expect(lintBefore.stdout).toInclude(
    'This timeout of 20000 ms is above the 15000 ms limit of the kiln lane',
  );

  expect(rigLimitAfter).toBe(25_000);
  expect(lintAfter.exitCode).toBe(0);
  expect(lintAfter.stdout).not.toInclude('max-test-timeout');
});
