import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir } from './create-temp-dir.ts';
import { removeOldTemplates } from './remove-old-templates.ts';

function setupTest() {
  const root = createTempDir('old-templates').path;
  const nowMs = Date.now();
  const hourMs = 60 * 60 * 1000;

  return {
    root,
    nowMs,
    hourMs,

    // Makes a template folder, with a marker that was last touched ageMs ago when ageMs is set.
    createTemplateFolder: (folder: string, ageMs: number | null) => {
      mkdirSync(join(root, folder));

      if (ageMs !== null) {
        writeFileSync(join(root, `${folder}.used`), '');

        const touched = new Date(nowMs - ageMs);

        utimesSync(join(root, `${folder}.used`), touched, touched);
      }
    },
  };
}

test('it removes a template of the same name that no call has used for an hour', () => {
  const ctx = setupTest();

  ctx.createTemplateFolder('site-aaaaaaaaaaaaaaaa', 2 * ctx.hourMs);
  ctx.createTemplateFolder('site-bbbbbbbbbbbbbbbb', 0);

  removeOldTemplates(ctx.root, 'site', 'site-bbbbbbbbbbbbbbbb', ctx.nowMs);

  expect(readdirSync(ctx.root).toSorted()).toStrictEqual([
    'site-bbbbbbbbbbbbbbbb',
    'site-bbbbbbbbbbbbbbbb.used',
  ]);
});

test('it keeps a template that a call used within the hour', () => {
  const ctx = setupTest();

  ctx.createTemplateFolder('site-aaaaaaaaaaaaaaaa', ctx.hourMs / 2);
  ctx.createTemplateFolder('site-bbbbbbbbbbbbbbbb', 0);

  removeOldTemplates(ctx.root, 'site', 'site-bbbbbbbbbbbbbbbb', ctx.nowMs);

  expect(existsSync(join(ctx.root, 'site-aaaaaaaaaaaaaaaa'))).toBeTrue();
});

test('it keeps the template it is told to keep, however old its marker is', () => {
  const ctx = setupTest();

  ctx.createTemplateFolder('site-bbbbbbbbbbbbbbbb', 5 * ctx.hourMs);

  removeOldTemplates(ctx.root, 'site', 'site-bbbbbbbbbbbbbbbb', ctx.nowMs);

  expect(existsSync(join(ctx.root, 'site-bbbbbbbbbbbbbbbb'))).toBeTrue();
});

test('it keeps the templates of other names, including a name that starts the same', () => {
  const ctx = setupTest();

  ctx.createTemplateFolder('site-aaaaaaaaaaaaaaaa', 5 * ctx.hourMs);
  ctx.createTemplateFolder('site-docs-aaaaaaaaaaaaaaaa', 5 * ctx.hourMs);
  ctx.createTemplateFolder('blog-aaaaaaaaaaaaaaaa', 5 * ctx.hourMs);
  ctx.createTemplateFolder('site-cccccccccccccccc', 0);

  removeOldTemplates(ctx.root, 'site', 'site-cccccccccccccccc', ctx.nowMs);

  expect(
    readdirSync(ctx.root)
      .filter((entry) => !entry.endsWith('.used'))
      .toSorted(),
  ).toStrictEqual(['blog-aaaaaaaaaaaaaaaa', 'site-cccccccccccccccc', 'site-docs-aaaaaaaaaaaaaaaa']);
});

test('it removes a staging folder of a dead build that is more than an hour old', () => {
  const ctx = setupTest();

  const stale = new Date(ctx.nowMs - 2 * ctx.hourMs);

  ctx.createTemplateFolder('site-aaaaaaaaaaaaaaaa.staging-4242-x', null);

  utimesSync(join(ctx.root, 'site-aaaaaaaaaaaaaaaa.staging-4242-x'), stale, stale);

  ctx.createTemplateFolder('site-bbbbbbbbbbbbbbbb', 0);

  removeOldTemplates(ctx.root, 'site', 'site-bbbbbbbbbbbbbbbb', ctx.nowMs);

  expect(existsSync(join(ctx.root, 'site-aaaaaaaaaaaaaaaa.staging-4242-x'))).toBeFalse();
});

test('it keeps a template with no marker that was made within the hour', () => {
  const ctx = setupTest();

  ctx.createTemplateFolder('site-aaaaaaaaaaaaaaaa', null);
  ctx.createTemplateFolder('site-bbbbbbbbbbbbbbbb', 0);

  removeOldTemplates(ctx.root, 'site', 'site-bbbbbbbbbbbbbbbb', ctx.nowMs);

  expect(existsSync(join(ctx.root, 'site-aaaaaaaaaaaaaaaa'))).toBeTrue();
});
