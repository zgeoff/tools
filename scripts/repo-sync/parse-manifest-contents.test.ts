import { expect, test } from 'bun:test';
import { parseManifestContents } from './parse-manifest-contents.ts';

test('it decodes the base64 content and keeps the blob', () => {
  const value = {
    sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
    content: 'WwogIHsgIm5h\nbWUiOiAia2V0dGxlIiB9Cl0K\n',
    encoding: 'base64',
  };

  expect(parseManifestContents(value)).toStrictEqual({
    sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
    text: '[\n  { "name": "kettle" }\n]\n',
  });
});

test.each([
  [
    'a file too large for content',
    { sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33', content: '', encoding: 'none' },
  ],
  ['a response with no blob', { content: 'W10K', encoding: 'base64' }],
  ['a folder listing', [{ name: 'manifest.json' }]],
])('it refuses %s', (_label, value) => {
  expect(parseManifestContents(value)).toBeNull();
});
