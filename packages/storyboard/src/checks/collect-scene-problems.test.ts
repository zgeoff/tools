import { expect, test } from 'bun:test';
import { MAX_FILE_BYTES, collectSceneProblems } from './collect-scene-problems.ts';

function setupTest() {
  return {
    wrapSVG: (inner: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">${inner}</svg>`,
    buildInput: (files: string[], sources: { path: string; text: string }[] = []) => {
      const committed = files.map((text, index) => ({ path: `docs/demo-${index}.svg`, text }));

      return { files: committed, sources, built: committed };
    },
  };
}

test('#collectSceneProblems accepts a plain file that matches its build', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<rect width="1" height="1" fill="#fff"/>')]);

  expect(collectSceneProblems(input)).toStrictEqual([]);
});

test('#collectSceneProblems fails an element that is not allowed, under allow-list', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<foreignObject width="1" height="1"/>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('allow-list');
});

test('#collectSceneProblems fails an attribute that is not allowed, under allow-list', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<rect width="1" height="1" data-x="1"/>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('allow-list');
});

test('#collectSceneProblems fails an @ rule in the style, under style', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<style>@import "x.css";</style>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('style');
});

test('#collectSceneProblems fails a CSS animation in the style, under style', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<style>.a { animation: spin 1s; }</style>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('style');
});

test('#collectSceneProblems fails a url() in the style, under style', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<style>.a { fill: url(#x); }</style>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('style');
});

test('#collectSceneProblems fails an href that leaves the file, under links', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<use href="https://example.test/a.svg#x"/>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('links');
});

test('#collectSceneProblems fails a script, under links', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG('<script>alert(1)</script>')]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('links');
});

test('#collectSceneProblems fails a url() that leaves the file, under links', () => {
  const ctx = setupTest();

  const input = ctx.buildInput([
    ctx.wrapSVG('<rect width="1" height="1" fill="url(https://a.test/x)"/>'),
  ]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('links');
});

test('#collectSceneProblems fails a file over the size limit, under size', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([ctx.wrapSVG(`<g>${' '.repeat(MAX_FILE_BYTES)}</g>`)]);

  expect(collectSceneProblems(input).map((problem) => problem.rule)).toContain('size');
});

test('#collectSceneProblems fails a hex colour in a source other than tokens.ts, under hex-colour', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([], [{ path: 'scene.tsx', text: "const sky = '#151b33';" }]);

  expect(collectSceneProblems(input)).toStrictEqual([
    { rule: 'hex-colour', message: expect.stringContaining('scene.tsx') },
  ]);
});

test('#collectSceneProblems accepts a hex colour in tokens.ts', () => {
  const ctx = setupTest();
  const input = ctx.buildInput([], [{ path: 'demo/tokens.ts', text: "sky: '#151b33'," }]);

  expect(collectSceneProblems(input)).toStrictEqual([]);
});

test('#collectSceneProblems fails a committed file that differs from its build, under stale', () => {
  const ctx = setupTest();
  const committed = [{ path: 'docs/demo-dark.svg', text: ctx.wrapSVG('<g/>') }];
  const built = [{ path: 'docs/demo-dark.svg', text: ctx.wrapSVG('<g opacity="1"/>') }];

  expect(collectSceneProblems({ files: committed, sources: [], built })).toStrictEqual([
    { rule: 'stale', message: expect.stringContaining('docs/demo-dark.svg') },
  ]);
});

test('#collectSceneProblems fails a built file that is missing from the commit, under stale', () => {
  const ctx = setupTest();
  const built = [{ path: 'docs/demo-dark.svg', text: ctx.wrapSVG('<g/>') }];

  expect(collectSceneProblems({ files: [], sources: [], built })).toStrictEqual([
    { rule: 'stale', message: expect.stringContaining('missing') },
  ]);
});
