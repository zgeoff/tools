import { expect, test } from 'bun:test';
import { isCoveredPinHead } from './is-covered-pin-head.ts';

test.each([
  [
    true,
    'a head that changes only the pin',
    {
      paths: ['sync/skills-pin.json'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: null,
    },
  ],
  [
    true,
    'a head that changes the pin and the manifest as the pin step writes it',
    {
      paths: ['sync/manifest.json', 'sync/skills-pin.json'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: {
        headText: '[{"name":"skill-kettle"}]\n',
        expected: {
          sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
          text: '[{"name":"skill-kettle"}]\n',
          added: ['skills/kettle/references/descaling.md'],
        },
      },
    },
  ],
  [
    false,
    'a head whose manifest differs from what the pin step writes',
    {
      paths: ['sync/manifest.json', 'sync/skills-pin.json'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: {
        headText: '[{"name":"skill-teapot"}]\n',
        expected: {
          sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
          text: '[{"name":"skill-kettle"}]\n',
          added: ['skills/kettle/references/descaling.md'],
        },
      },
    },
  ],
  [
    false,
    'a head that changes the manifest when the pin step adds nothing',
    {
      paths: ['sync/manifest.json', 'sync/skills-pin.json'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: {
        headText: '[]\n',
        expected: { sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33', text: '[]\n', added: [] },
      },
    },
  ],
  [
    false,
    'a head whose manifest the pin step could not read',
    {
      paths: ['sync/manifest.json', 'sync/skills-pin.json'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: { headText: '[]\n', expected: null },
    },
  ],
  [
    false,
    'a head that changes another file',
    {
      paths: ['sync/skills-pin.json', 'README.md'],
      headPin: '89abcdef0123456789abcdef0123456789abcdef',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: null,
    },
  ],
  [
    false,
    'a head that moved to another pin',
    {
      paths: ['sync/skills-pin.json'],
      headPin: '456789abcdef0123456789abcdef0123456789ab',
      proposed: '89abcdef0123456789abcdef0123456789abcdef',
      manifest: null,
    },
  ],
  [
    false,
    'a head with no full commit ID in the pin',
    { paths: ['sync/skills-pin.json'], headPin: null, proposed: null, manifest: null },
  ],
])('it returns %p for %s', (expected, _label, head) => {
  expect(isCoveredPinHead(head)).toBe(expected);
});
