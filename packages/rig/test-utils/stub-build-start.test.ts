import { expect, test } from 'bun:test';
import { stubBuildStartSchema } from './stub-build-start.ts';

test('it parses the start line of the stub build', () => {
  const start = stubBuildStartSchema.parse(
    JSON.parse('{"event":"build-started","buildPid":4417,"helperPid":4420}'),
  );

  expect(start).toStrictEqual({ event: 'build-started', buildPid: 4417, helperPid: 4420 });
});

test('it refuses a line with no helper process ID', () => {
  const result = stubBuildStartSchema.safeParse({ event: 'build-started', buildPid: 4417 });

  expect(result.success).toBeFalse();
  expect(result.error?.issues).toMatchObject([{ path: ['helperPid'] }]);
});
