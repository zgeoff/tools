import { expect, test } from 'bun:test';
import { parseReleaseOutputs } from './parse-release-outputs.ts';

test('it returns the outputs and the released paths of a multi-package release', () => {
  const result = parseReleaseOutputs(
    JSON.stringify({
      releases_created: 'true',
      paths_released: '["packages/std","packages/tsconfig"]',
      'packages/std--tag_name': '@zgeoff/std@0.4.0',
    }),
  );

  expect(result).toStrictEqual({
    kind: 'parsed',
    outputs: {
      releases_created: 'true',
      paths_released: '["packages/std","packages/tsconfig"]',
      'packages/std--tag_name': '@zgeoff/std@0.4.0',
    },
    paths: ['packages/std', 'packages/tsconfig'],
  });
});

test('it returns no paths for the outputs of a skipped step', () => {
  const result = parseReleaseOutputs('{}');

  expect(result).toStrictEqual({ kind: 'parsed', outputs: {}, paths: [] });
});

test.each([
  ['text that is not JSON', 'releases_created=true'],
  ['a JSON array', '["packages/std"]'],
  ['an output that is not text', '{"releases_created":true}'],
])('it refuses release outputs that hold %s', (_label, text) => {
  const result = parseReleaseOutputs(text);

  expect(result).toStrictEqual({
    kind: 'invalid',
    message: 'the release outputs hold no JSON object of text values',
  });
});

test.each([
  ['text that is not JSON', 'packages/std'],
  ['a list with a value that is not text', '["packages/std",1]'],
])('it refuses a paths_released that holds %s', (_label, paths) => {
  const result = parseReleaseOutputs(JSON.stringify({ paths_released: paths }));

  expect(result).toStrictEqual({
    kind: 'invalid',
    message: 'paths_released holds no JSON array of paths',
  });
});
