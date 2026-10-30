import { expect, test } from 'bun:test';
import { findPrivateDirProblem } from './find-private-dir-problem.ts';

test('it finds no problem in a folder that its user owns and that only its user can open', () => {
  const status = { isDirectory: true, ownerID: 1000, mode: 0o4_0700 };

  expect(findPrivateDirProblem('/tmp/browser-lane-chrome-1000', status, 1000)).toBeNull();
});

test.each([
  ['nothing', null],
  ['a file', { isDirectory: false, ownerID: 1000, mode: 0o10_0600 }],
])('it finds a problem when the path holds %s', (_, status) => {
  expect(findPrivateDirProblem('/tmp/browser-lane-chrome-1000', status, 1000)).toBe(
    "the browser lane's temp folder /tmp/browser-lane-chrome-1000 is no folder of its own",
  );
});

test('it finds a problem in a folder that another user owns', () => {
  const status = { isDirectory: true, ownerID: 1001, mode: 0o4_0700 };

  expect(findPrivateDirProblem('/tmp/browser-lane-chrome-1000', status, 1000)).toBe(
    "the browser lane's temp folder /tmp/browser-lane-chrome-1000 belongs to user 1001, not to user 1000",
  );
});

test.each([
  ['its group', 0o4_0750, '750'],
  ['every user', 0o4_0705, '705'],
])('it finds a problem in a folder that %s can open', (_, mode, shown) => {
  const status = { isDirectory: true, ownerID: 1000, mode };

  expect(findPrivateDirProblem('/tmp/browser-lane-chrome-1000', status, 1000)).toBe(
    `the browser lane's temp folder /tmp/browser-lane-chrome-1000 is open to other users, with mode ${shown}`,
  );
});
