import { expect, test } from 'bun:test';
import { readlinkSync } from 'node:fs';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';

test.if(process.platform === 'linux')(
  "it ends the name with the test process's ID and PID namespace number",
  () => {
    const namespace = /\[(?<inode>\d+)\]/u.exec(readlinkSync('/proc/self/ns/pid'))?.groups?.[
      'inode'
    ];

    expect(readRunFolderPrefix('kettle-')).toBe(`kettle-pid${process.pid}-ns${namespace}-`);
  },
);
