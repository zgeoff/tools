import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { nodeFileSystem } from '../../../scripts/ci/node-file-system.ts';
import { readPinnedSkillText } from '../../../test-utils/read-pinned-skill-text.ts';
import { standardLanes } from './standard-lanes.ts';

test('it holds the lanes and limits of the Lanes table in the shared testing skill', async () => {
  const markdown = await readPinnedSkillText(
    nodeFileSystem,
    join(import.meta.dir, '..', '..', '..'),
    'skills/testing/references/slow-tests.md',
  );

  const rows = [
    ...markdown.matchAll(/^\| (?<lane>[a-z0-9-]+) +\| (?<where>[^|]+)\| (?<seconds>\d+) s +\|/gmu),
  ].map((match) => ({
    name: match.groups?.['lane'],
    where: match.groups?.['where']?.trim(),
    limitMs: Number(match.groups?.['seconds']) * 1000,
  }));

  expect(rows.length).toBe(7);
  expect(standardLanes.map((lane) => lane.name)).toIncludeSameMembers(rows.map((row) => row.name));

  for (const row of rows) {
    const lane = standardLanes.find((candidate) => candidate.name === row.name);

    expect(lane?.limitMs).toBe(row.limitMs);

    // a suffix lane's row names its files as `<name>.<suffix>.test.ts`
    if (lane?.suffix !== null && lane?.suffix !== undefined) {
      expect(row.where).toBe(`\`<name>${lane.suffix}.test.ts\``);
    }
  }
});

test('it runs every lane but unit with one process per file', () => {
  const parallel = standardLanes.map((lane) => [lane.name, lane.parallel]);

  expect(parallel).toStrictEqual([
    ['unit', 'workers'],
    ['e2e', 1],
    ['browser', 1],
    ['docker', 1],
    ['host', 1],
    ['agent-sdk', 1],
    ['model-api', 1],
  ]);
});
