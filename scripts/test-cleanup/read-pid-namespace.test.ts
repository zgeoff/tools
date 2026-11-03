import { expect, test } from 'bun:test';
import { readlinkSync } from 'node:fs';
import { readPIDNamespace } from './read-pid-namespace.ts';

test.if(process.platform === 'linux')(
  "it returns the number of this process's PID namespace on Linux",
  () => {
    expect(`pid:[${readPIDNamespace()}]`).toBe(readlinkSync('/proc/self/ns/pid'));
  },
);

test.if(process.platform !== 'linux')('it returns host where there are no PID namespaces', () => {
  expect(readPIDNamespace()).toBe('host');
});
