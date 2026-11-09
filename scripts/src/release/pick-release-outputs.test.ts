import { expect, test } from 'bun:test';
import { pickReleaseOutputs } from './pick-release-outputs.ts';

test('it reports the first package of a multi-package release', () => {
  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
    'packages/tsconfig--version': '1.2.0',
  };

  const result = pickReleaseOutputs(JSON.stringify(releaseOutputs, null, 2));

  expect(result).toStrictEqual({
    kind: 'picked',
    outputs: {
      releases_created: 'true',
      tag: '@zgeoff/std@0.4.0',
      version: '0.4.0',
      'release-outputs': JSON.stringify(releaseOutputs),
    },
  });
});

test('it reports the tag and version of a release of one package at the root', () => {
  const releaseOutputs = {
    releases_created: 'true',
    release_created: 'true',
    paths_released: '["."]',
    tag_name: 'v4.2.1',
    version: '4.2.1',
  };

  const result = pickReleaseOutputs(JSON.stringify(releaseOutputs));

  expect(result).toStrictEqual({
    kind: 'picked',
    outputs: {
      releases_created: 'true',
      tag: 'v4.2.1',
      version: '4.2.1',
      'release-outputs': JSON.stringify(releaseOutputs),
    },
  });
});

test('it reports no release, tag or version for a run that released nothing', () => {
  const releaseOutputs = { releases_created: 'false', paths_released: '[]', prs_created: 'true' };
  const result = pickReleaseOutputs(JSON.stringify(releaseOutputs));

  expect(result).toStrictEqual({
    kind: 'picked',
    outputs: {
      releases_created: 'false',
      tag: '',
      version: '',
      'release-outputs': JSON.stringify(releaseOutputs),
    },
  });
});

test('it reports no release for the empty outputs of a skipped step', () => {
  const result = pickReleaseOutputs('{}');

  expect(result).toStrictEqual({
    kind: 'picked',
    outputs: { releases_created: 'false', tag: '', version: '', 'release-outputs': '{}' },
  });
});

test('it passes on the reason it cannot read the release outputs', () => {
  const result = pickReleaseOutputs('{"releases_created":"true","paths_released":"packages/std"}');

  expect(result).toStrictEqual({
    kind: 'invalid',
    message: 'paths_released holds no JSON array of paths',
  });
});
