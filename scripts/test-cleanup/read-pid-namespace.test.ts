import { expect, test } from 'bun:test';
import { readlinkSync } from 'node:fs';
import { readPIDNamespace } from './read-pid-namespace.ts';

test("it returns the number in the process's PID namespace link on Linux", () => {
  expect(readPIDNamespace({ platform: 'linux', readLink: () => 'pid:[7001]' })).toBe('7001');
});

test('it returns host where there are no PID namespaces', () => {
  expect(
    readPIDNamespace({
      platform: 'darwin',
      readLink: () => {
        throw new Error('ENOENT: no such file or directory');
      },
    }),
  ).toBe('host');
});

test('it returns unknown when the namespace link cannot be read', () => {
  expect(
    readPIDNamespace({
      platform: 'linux',
      readLink: () => {
        throw new Error('EACCES: permission denied');
      },
    }),
  ).toBe('unknown');
});

test('it returns unknown for a namespace link of another shape', () => {
  expect(readPIDNamespace({ platform: 'linux', readLink: () => 'net:[7001]' })).toBe('unknown');
});

test.if(process.platform === 'linux')('it reads the namespace of this process on Linux', () => {
  expect(`pid:[${readPIDNamespace({ platform: 'linux', readLink: readlinkSync })}]`).toBe(
    readlinkSync('/proc/self/ns/pid'),
  );
});
