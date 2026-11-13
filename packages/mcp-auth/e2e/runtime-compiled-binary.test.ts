import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-auth-binary-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,

    // An entry that, like an app's binary, does not load the polyfill itself.
    compileEntry: async (source: string) => {
      const entry = join(directory, 'entry.ts');
      const binary = join(directory, 'entry-binary');

      await writeFile(entry, source);

      await $`bun build --compile ${entry} --outfile ${binary}`.quiet();

      return $`${binary}`.quiet().nothrow();
    },
  };
}

test('it starts a compiled binary that imports the package, without the polyfill', async () => {
  const ctx = await setupTest();

  const index = join(import.meta.dir, '..', 'src', 'index.ts');
  const elysia = join(import.meta.dir, '..', 'src', 'elysia', 'index.ts');

  const result = await ctx.compileEntry(
    `import { openMCPAuth } from ${JSON.stringify(index)};
     import * as adapter from ${JSON.stringify(elysia)};
     console.log(typeof openMCPAuth, typeof adapter);`,
  );

  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe('function object');
});

// An app that loads its commands lazily makes Bun wrap each module in a lazy
// init, which runs a module's ESM imports before its CommonJS ones.
test('it starts a compiled binary that loads the package through a dynamic import, without the polyfill', async () => {
  const ctx = await setupTest();

  const index = join(import.meta.dir, '..', 'src', 'index.ts');

  const result = await ctx.compileEntry(
    `const auth = await import(${JSON.stringify(index)});
     console.log(typeof auth.openMCPAuth);`,
  );

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: 'function', stderr: '' });
});
