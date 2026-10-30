import { expect, test } from 'bun:test';
import { hasBrowserBuildScript } from './has-browser-build-script.ts';

test('it finds the build:browser script in the package manifest', () => {
  const manifest = {
    scripts: { 'build:browser': 'vite build --outDir "$RIG_BROWSER_BUILD_DIR"' },
  };

  expect(hasBrowserBuildScript(manifest)).toBeTrue();
});

test.each([
  ['a manifest with no scripts', { name: 'notes-app' }],
  ['scripts without build:browser', { scripts: { build: 'vite build' } }],
  ['a build:browser that is no string', { scripts: { 'build:browser': ['vite', 'build'] } }],
  ['scripts that are no object', { scripts: 'vite build' }],
  ['a manifest that is no object', 'notes-app'],
  ['a null manifest', null],
])('it finds no build script in %s', (_, manifest) => {
  expect(hasBrowserBuildScript(manifest)).toBeFalse();
});
