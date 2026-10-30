import { expect, test } from 'bun:test';
import { pickMergeBlobsCommand } from './pick-merge-blobs-command.ts';

test('it reads whether origin is a promisor remote first, whatever git config exits with', () => {
  expect(pickMergeBlobsCommand({ commits: ['c1'], bases: [] })).toStrictEqual({
    reading: 'promisor',
    argv: ['git', 'config', '--type=bool', '--get', 'remote.origin.promisor'],
    exitCodes: 'any',
  });
});

test.each([[''], ['false\n']])(
  'it fetches nothing when the promisor setting reads %p',
  (promisor) => {
    expect(pickMergeBlobsCommand({ commits: ['c1'], promisor, bases: [] })).toBeNull();
  },
);

test('it lists the merges among the commits of a promisor clone', () => {
  expect(
    pickMergeBlobsCommand({ commits: ['c1', 'm1'], promisor: 'true\n', bases: [] }),
  ).toStrictEqual({
    reading: 'merges',
    argv: ['git', 'rev-list', '--merges', '--parents', '--no-walk=unsorted', '--stdin'],
    stdin: 'c1\nm1\n',
    exitCodes: [0],
  });
});

test('it fetches nothing when no commit is a merge', () => {
  expect(
    pickMergeBlobsCommand({ commits: ['c1'], promisor: 'true\n', merges: '', bases: [] }),
  ).toBeNull();
});

test('it reads the merge bases of the next merge whose bases it lacks, from its parents', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1', 'm2'],
      promisor: 'true\n',
      merges: 'm1 p1 p2\nm2 p3 p4 p5\n',
      bases: ['b1\n'],
    }),
  ).toStrictEqual({
    reading: 'bases',
    argv: ['git', 'merge-base', '--all', 'p3', 'p4', 'p5'],
    exitCodes: [0, 1],
  });
});

test('it fetches nothing when no merge has a merge base', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1'],
      promisor: 'true\n',
      merges: 'm1 p1 p2\n',
      bases: [''],
    }),
  ).toBeNull();
});

test('it lists the missing objects of each merge base, merge and parent once', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1', 'm2'],
      promisor: 'true\n',
      merges: 'm1 p1 p2\nm2 m1 p3\n',
      bases: ['b1\n', 'b1\n'],
    }),
  ).toStrictEqual({
    reading: 'listing',
    argv: ['git', 'rev-list', '--objects', '--missing=print', '--no-walk', '--stdin'],
    stdin: 'b1\nm1\np1\np2\nm2\np3\n',
    exitCodes: [0],
  });
});

test('it diffs each merge base against the merge and each parent', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1'],
      promisor: 'true\n',
      merges: 'm1 p1 p2\n',
      bases: ['b1\nb2\n'],
      listing: '',
    }),
  ).toStrictEqual({
    reading: 'diff',
    argv: ['git', 'diff-tree', '-r', '--no-abbrev', '--stdin'],
    stdin: 'b1 m1\nb1 p1\nb1 p2\nb2 m1\nb2 p1\nb2 p2\n',
    exitCodes: [0],
  });
});

test('it fetches only the missing blobs that the diffs name, once each, and no submodule commit', () => {
  const diff = [
    'b1 m1',
    ':100644 100644 aaa1 aaa2 M\tgreet.txt',
    ':000000 100755 0000 aaa3 A\trun.sh',
    ':120000 120000 aaa4 aaa5 M\tlink',
    ':160000 160000 sub1 sub2 M\tvendor/lib',
    'b1 p1',
    ':100644 100644 aaa1 aaa6 M\tgreet.txt',
    '',
  ].join('\n');

  expect(
    pickMergeBlobsCommand({
      commits: ['m1'],
      promisor: 'true\n',
      merges: 'm1 p1\n',
      bases: ['b1\n'],
      listing: 'm1\np1\n?aaa1\n?aaa3\n?aaa5\n?aaa6\n?sub2\naaa2 greet.txt\n',
      diff,
    }),
  ).toStrictEqual({
    reading: 'fetch',
    argv: [
      'git',
      '-c',
      'fetch.negotiationAlgorithm=noop',
      'fetch',
      '--quiet',
      '--no-tags',
      '--no-write-fetch-head',
      '--filter=blob:none',
      '--stdin',
      'origin',
    ],
    stdin: 'aaa1\naaa3\naaa5\naaa6\n',
    exitCodes: [0],
  });
});

test('it fetches nothing when the clone holds every blob that the diffs name', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1'],
      promisor: 'true\n',
      merges: 'm1 p1\n',
      bases: ['b1\n'],
      listing: 'm1\np1\naaa1 greet.txt\n',
      diff: ':100644 100644 aaa1 aaa1 M\tgreet.txt\n',
    }),
  ).toBeNull();
});

test('it runs nothing more once the fetch has run', () => {
  expect(
    pickMergeBlobsCommand({
      commits: ['m1'],
      promisor: 'true\n',
      merges: 'm1 p1\n',
      bases: ['b1\n'],
      listing: '?aaa1\n',
      diff: ':100644 100644 aaa1 aaa1 M\tgreet.txt\n',
      fetch: '',
    }),
  ).toBeNull();
});
