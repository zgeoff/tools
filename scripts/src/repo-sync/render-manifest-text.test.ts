import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderManifestText } from './render-manifest-text.ts';

test('it renders each object on its own lines and a short list of names on one line', () => {
  const text = renderManifestText([
    {
      name: 'kettle',
      except: ['example/teapot', 'example/urn'],
      files: [{ source: 'a.md', target: 'b.md' }],
    },
  ]);

  expect(text).toBe(`[
  {
    "name": "kettle",
    "except": ["example/teapot", "example/urn"],
    "files": [
      {
        "source": "a.md",
        "target": "b.md"
      }
    ]
  }
]
`);
});

// The line of each list is 101 characters with its comma, and 100 without one.
test.each([
  [
    'breaks a list whose line passes the print width with its comma',
    { except: ['x'.repeat(84)], name: 'kettle' },
    `{\n  "except": [\n    "${'x'.repeat(84)}"\n  ],\n  "name": "kettle"\n}\n`,
  ],
  [
    'keeps a last list on one line when its line fits the print width',
    { name: 'kettle', except: ['x'.repeat(84)] },
    `{\n  "name": "kettle",\n  "except": ["${'x'.repeat(84)}"]\n}\n`,
  ],
])('it %s', (_label, manifest, expected) => {
  expect(renderManifestText(manifest)).toBe(expected);
});

test('it renders the sync manifest as the formatter leaves it', async () => {
  const text = await readFile(
    join(import.meta.dir, '..', '..', '..', 'sync', 'manifest.json'),
    'utf8',
  );

  expect(renderManifestText(JSON.parse(text))).toBe(text);
});
