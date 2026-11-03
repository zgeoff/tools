import { expect, test } from 'bun:test';
import { buildStubCheckRunner } from './build-stub-check-runner.ts';

test('it answers each check with its exit code and records the call with its arguments', async () => {
  const stub = buildStubCheckRunner({ prose: 1, links: 0 });

  const prose = await stub.runCheck('prose', ['docs/guide.md']);
  const links = await stub.runCheck('links', []);

  expect(prose).toBe(1);
  expect(links).toBe(0);
  expect(stub.calls).toStrictEqual(['prose docs/guide.md', 'links']);
});

test('it rejects with the error a check is given, as a check that cannot start throws', () => {
  const stub = buildStubCheckRunner({ length: new Error('Executable not found in $PATH: "bash"') });
  const result = stub.runCheck('length', []);

  expect(result).rejects.toThrow('Executable not found in $PATH: "bash"');
});

test('it fails on a check the test gave no answer for', () => {
  const stub = buildStubCheckRunner({});

  expect(() => stub.runCheck('vision', [])).toThrow(
    'the stub check runner has no answer for vision',
  );
});
