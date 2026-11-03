import { expect, test } from 'bun:test';
import { readPIDNamespace } from '../test-cleanup/read-pid-namespace.ts';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';

test("it ends the name with the test process's ID and PID namespace", () => {
  expect(readRunFolderPrefix('kettle-')).toBe(`kettle-pid${process.pid}-ns${readPIDNamespace()}-`);
});
