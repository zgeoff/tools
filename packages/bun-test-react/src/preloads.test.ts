import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The project sits inside this package so its preloads resolve @zgeoff/bun-test-react through the
// workspace link and React through this package's own dependencies. It runs as a child `bun test`
// because the preloads replace globals that the rest of this repo's suite relies on.
async function setupTest(source: string) {
  const dir = await mkdtemp(join(import.meta.dir, '../.test-'));

  await writeFile(
    join(dir, 'bunfig.toml'),
    '[test]\npreload = ["@zgeoff/bun-test-react/zustand", "@zgeoff/bun-test-react"]\n',
  );

  await writeFile(join(dir, 'fixture.test.ts'), source);

  return {
    dir,
    async [Symbol.asyncDispose]() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it renders into a happy-dom document that the jest-dom matchers read', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      "import { render, screen } from '@testing-library/react';",
      "import { createElement } from 'react';",
      '',
      "test('renders', () => {",
      "  render(createElement('p', null, 'hello'));",
      "  expect(screen.getByText('hello')).toBeInTheDocument();",
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('1 pass');
});

test('it unmounts the rendered tree before the next test', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      "import { render } from '@testing-library/react';",
      "import { createElement } from 'react';",
      '',
      "test('renders', () => {",
      "  render(createElement('p', null, 'hello'));",
      '});',
      '',
      "test('starts from an empty body', () => {",
      "  expect(document.body.innerHTML).toBe('');",
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('2 pass');
});

test('it resets each zustand store to its initial state before the next test', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      "import { create } from 'zustand';",
      '',
      'const useCounter = create<{ count: number }>()(() => ({ count: 0 }));',
      '',
      "test('increments', () => {",
      '  useCounter.setState({ count: 5 });',
      '});',
      '',
      "test('starts from zero', () => {",
      '  expect(useCounter.getState().count).toBe(0);',
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('2 pass');
});

test('it resets a store from zustand createStore before the next test', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      "import { createStore } from 'zustand';",
      '',
      'const counter = createStore<{ count: number }>()(() => ({ count: 0 }));',
      '',
      "test('increments', () => {",
      '  counter.setState({ count: 5 });',
      '});',
      '',
      "test('starts from zero', () => {",
      '  expect(counter.getState().count).toBe(0);',
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('2 pass');
});

test('it resets a store from zustand/vanilla createStore before the next test', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      "import { createStore } from 'zustand/vanilla';",
      '',
      'const counter = createStore<{ count: number }>()(() => ({ count: 0 }));',
      '',
      "test('increments', () => {",
      '  counter.setState({ count: 5 });',
      '});',
      '',
      "test('starts from zero', () => {",
      '  expect(counter.getState().count).toBe(0);',
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('2 pass');
});

test('it pipes a Bun response body into a WritableStream under happy-dom', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      '',
      "test('pipes', async () => {",
      '  const chunks: string[] = [];',
      '  const decoder = new TextDecoder();',
      "  const body = new Response('body').body;",
      '',
      '  if (body === null) {',
      "    throw new Error('the response has no body');",
      '  }',
      '',
      '  await body.pipeTo(',
      '    new WritableStream({',
      '      write(chunk: Uint8Array) {',
      '        chunks.push(decoder.decode(chunk));',
      '      },',
      '    }),',
      '  );',
      '',
      "  expect(chunks.join('')).toBe('body');",
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('1 pass');
});

test('it fetches with an abort signal under happy-dom', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      '',
      "test('fetches', async () => {",
      "  using server = Bun.serve({ port: 0, fetch: () => new Response('served') });",
      '',
      '  const response = await fetch(server.url, { signal: new AbortController().signal });',
      '  const text = await response.text();',
      '',
      "  expect(text).toBe('served');",
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toInclude('1 pass');
});

test('it prints a node in a failure message as its opening tag', async () => {
  await using project = await setupTest(
    [
      "import { expect, test } from 'bun:test';",
      '',
      "test('fails on an element', () => {",
      "  const element = document.createElement('p');",
      '',
      "  element.setAttribute('class', 'note');",
      '',
      '  expect(element).toBeNull();',
      '});',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([process.execPath, 'test'], { cwd: project.dir });

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toInclude('<p class="note">');
});
