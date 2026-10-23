# Shell script testing

A shell script's test is a `bun:test` file beside the script, `<script>.test.ts`, that runs the real
script through Bun's `$` shell, and ShellCheck is the script's static check. One runner keeps every
rule in [SKILL.md](../SKILL.md) in force for shell scripts, its timeouts, reports, and lanes
included, with no second tool to keep up. A bats or ShellSpec suite and a hand-written runner, such
as a `test-*.sh` file that runs cases and counts failures, never appear.

## Running the script

A test calls the script through `$` this way:

- Name the interpreter and the script path in the command, as in
  `` $`bash ${ctx.scriptPath} ${ref}` ``. Take the path from `import.meta.url` or `import.meta.dir`.
- Pass each argument as an interpolated value. Bun escapes it, so a value with a space, a `;`, or a
  `$` reaches the script as one argument, and an array becomes one argument per element. Never build
  the command line as a string, and never interpolate `{ raw: … }`.
- Chain `.nothrow()`, so a nonzero exit returns its result instead of throwing, and `.quiet()`, so
  the script's output stays out of the test run's output.
- Set the working directory with `.cwd(dir)` and the environment with `.env({ … })`. `.env()`
  replaces the whole environment, so spread `process.env` or a clean env into it.
- Feed standard input with a redirect from a `Response`:
  `` $`bash ${path} < ${Response.json(files)}` ``.
- Run a setup command, such as `git init`, through `$` without `.nothrow()`, so a failed setup
  throws where it fails instead of surfacing as a wrong result later.

`stdout` and `stderr` are buffers, so read them with `.toString()` before a string matcher.

## Programs the script calls

A program the script calls that the test cannot run, such as `gh` against GitHub, gets a stub
executable in a folder that the test puts first on the script's `PATH`. A script takes the time
argument that [Time and waiting](../SKILL.md#time-and-waiting) asks for as an environment variable,
such as its poll interval, and the test sets it.

## ShellCheck

CI runs ShellCheck over every `.sh` file that git tracks, and the pre-push baseline runs it over the
`.sh` files that a branch changes. Fix a finding in the script. A disable directive is the
exception: it names the code and gives its reason on the same line, as in
`# shellcheck disable=SC2053 # the pattern is a glob on purpose`.

## Example

A made-up `prune-logs.sh` takes a folder and a number of days, removes each `.log` file older than
that, and prints each name it removes:

```ts
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'prune-logs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, scriptPath: join(import.meta.dir, 'prune-logs.sh') };
}

test('it removes the logs older than the cutoff and keeps the rest', async () => {
  const ctx = await setupTest();
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);

  await writeFile(join(ctx.directory, 'old.log'), 'old\n');
  await utimes(join(ctx.directory, 'old.log'), tenDaysAgo, tenDaysAgo);
  await writeFile(join(ctx.directory, 'new.log'), 'new\n');

  const result = await $`bash ${ctx.scriptPath} ${ctx.directory} 7`.nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: 'removed old.log\n', stderr: '' });
  expect(await readdir(ctx.directory)).toStrictEqual(['new.log']);
});
```
