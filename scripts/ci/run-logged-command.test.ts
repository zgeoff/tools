import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { runCommand } from './run-command.ts';

test('it copies the output of the command as it runs and returns it captured too', async () => {
  // A child process runs the logged command, so the test reads the output it copies.
  const result = await runCommand(
    [
      'bun',
      '-e',
      `import { runLoggedCommand } from ${JSON.stringify(join(import.meta.dir, 'run-logged-command.ts'))};
const result = await runLoggedCommand(['sh', '-c', 'echo boiled; echo steam >&2; exit 3'], { cwd: '.', env: { PATH: process.env.PATH } });
console.log(JSON.stringify(result));`,
    ],
    { cwd: import.meta.dir, env: { PATH: process.env['PATH'] } },
  );

  expect(result.stdout).toBe(
    `boiled\n${JSON.stringify({ exitCode: 3, stdout: 'boiled\n', stderr: 'steam\n' })}\n`,
  );

  expect(result.stderr).toBe('steam\n');
});
