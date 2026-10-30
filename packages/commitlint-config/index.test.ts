import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import lint from '@commitlint/lint';
import load from '@commitlint/load';

// The project sits inside this repo so `extends` resolves @zgeoff/commitlint-config through the
// workspace link in the root node_modules, the way a consumer's install resolves it.
async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-'));

  await writeFile(
    join(directory, 'commitlint.config.js'),
    "export default { extends: ['@zgeoff/commitlint-config'] };\n",
  );

  // The commitlint CLI takes most of a second to start, so the rule checks lint in the test's own
  // process, with the config that the CLI would load.
  const config = await load({}, { cwd: directory });

  const parserOpts = config.parserPreset?.parserOpts ?? null;
  const lintOptions: Parameters<typeof lint>[2] = parserOpts === null ? {} : { parserOpts };

  return {
    commitlint: join(import.meta.dir, 'node_modules/.bin/commitlint'),
    directory,
    lintMessage: async (message: string) => {
      const result = await lint(message, config.rules, lintOptions);

      return { valid: result.valid, ruleNames: result.errors.map((error) => error.name) };
    },
    async [Symbol.asyncDispose]() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('it accepts a conventional header with a lower-case scope and subject through the commitlint CLI', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.directory], {
    stdin: Buffer.from('feat(tsconfig): add the react variant\n'),
  });

  expect(result.exitCode).toBe(0);
});

test('it rejects a type outside the allowed list', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage('wip: add the react variant');

  expect(result.valid).toBeFalse();
  expect(result.ruleNames).toContain('type-enum');
});

test('it rejects a subject with an upper-case word', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage('chore: inherit the shared CodeRabbit config');

  expect(result.valid).toBeFalse();
  expect(result.ruleNames).toContain('subject-case');
});

test('it rejects a header longer than 72 characters', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage(`fix: ${'a'.repeat(68)}`);

  expect(result.valid).toBeFalse();
  expect(result.ruleNames).toContain('header-max-length');
});

test('it rejects a body that starts on the line after the header', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage('fix: keep the lockfile in sync\nthe body starts here');

  expect(result.valid).toBeFalse();
  expect(result.ruleNames).toContain('body-leading-blank');
});

test('it accepts a breaking-change header', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage('feat(core)!: remove the old api');

  expect(result).toStrictEqual({ valid: true, ruleNames: [] });
});

test('it rejects a header with no type', async () => {
  await using project = await setupTest();

  const result = await project.lintMessage(': add the react variant');

  expect(result.valid).toBeFalse();
  expect(result.ruleNames).toContain('type-empty');
});
