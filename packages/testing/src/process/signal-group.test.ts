import { expect, test } from 'bun:test';
import { signalGroup } from './signal-group.ts';

test.each([['ESRCH'], ['EPERM']])('it treats a group that fails with %s as gone', (code) => {
  expect(() => {
    signalGroup(4242, 'SIGTERM', () => {
      throw Object.assign(new Error(`kill ${code}`), { code });
    });
  }).not.toThrow();
});

test('it rethrows any other failure', () => {
  expect(() => {
    signalGroup(4242, 'SIGTERM', () => {
      throw Object.assign(new Error('kill EINVAL'), { code: 'EINVAL' });
    });
  }).toThrow('kill EINVAL');
});

test('it signals the group, which is the negative of its leader', () => {
  const sent: [number, string | number][] = [];

  signalGroup(4242, 'SIGKILL', (pid, signal) => {
    sent.push([pid, signal]);
  });

  expect(sent).toStrictEqual([[-4242, 'SIGKILL']]);
});
