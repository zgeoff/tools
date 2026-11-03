import { expect, test } from 'bun:test';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';

test("it ends the name with the test process's ID and PID namespace", () => {
  expect(readRunFolderPrefix('kettle-', { platform: 'linux', readLink: () => 'pid:[7001]' })).toBe(
    `kettle-pid${process.pid}-ns7001-`,
  );
});

test('it names the host namespace where there are no PID namespaces', () => {
  expect(readRunFolderPrefix('kettle-', { platform: 'darwin', readLink: () => '' })).toBe(
    `kettle-pid${process.pid}-nshost-`,
  );
});
