import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('it quotes, in the workflow lint reference, each warning message that the lint prints', async () => {
  const source = await Bun.file(
    join(import.meta.dir, '../packages/chex/src/run-workflows-check.ts'),
  ).text();

  const reference = await Bun.file(
    join(import.meta.dir, '../sync/skills/ci-design/references/workflow-lint.md'),
  ).text();

  const quoted = reference.replaceAll(/\s+/gu, ' ');

  const unquoted = [...source.matchAll(/message:\s*(?:`(?<template>[^`]*)`|'(?<text>[^']*)')/gu)]
    .map((match) =>
      (match.groups?.['template'] ?? match.groups?.['text'] ?? '').replaceAll(/\$\{[^}]+\}/gu, '…'),
    )
    .filter((message) => message !== 'cannot parse the workflow: …')
    .filter((message) => !quoted.includes(`\`${message}\``));

  expect(unquoted).toStrictEqual([]);
});
