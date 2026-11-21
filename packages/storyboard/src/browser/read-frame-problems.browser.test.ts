import { expect, onTestFinished, test } from 'bun:test';
import { readFrameProblems } from './read-frame-problems.ts';

function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome', width: 200, height: 100 });

  onTestFinished(() => {
    view.close();
  });

  return {
    readProblems: (svg: string) => readFrameProblems(view, svg),
    wrapSVG: (inner: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">${inner}</svg>`,
  };
}

test('#readFrameProblems reports two texts that overlap', async () => {
  const ctx = setupTest();

  const svg = ctx.wrapSVG(
    '<text x="20" y="50" font-size="20">alpha beta</text><text x="30" y="50" font-size="20">gamma delta</text>',
  );

  const problems = await ctx.readProblems(svg);

  expect(problems.overlaps).toSatisfyAny((message: string) => message.includes('overlaps'));
});

test('#readFrameProblems passes two texts that overlap under a parent with no opacity', async () => {
  const ctx = setupTest();

  const svg = ctx.wrapSVG(
    '<g opacity="0"><text x="20" y="50" font-size="20">alpha beta</text><text x="30" y="50" font-size="20">gamma delta</text></g>',
  );

  const problems = await ctx.readProblems(svg);

  expect(problems).toStrictEqual({ overlaps: [], outside: [], lastFrameDifference: undefined });
});

test('#readFrameProblems reports a text outside the view box', async () => {
  const ctx = setupTest();
  const svg = ctx.wrapSVG('<text x="150" y="50" font-size="20">far beyond the edge</text>');

  const problems = await ctx.readProblems(svg);

  expect(problems.outside).toSatisfyAny((message: string) => message.includes('outside'));
});

test('#readFrameProblems reports a last frame that does not match the first', async () => {
  const ctx = setupTest();

  const svg = ctx.wrapSVG(
    '<rect width="200" height="100" fill="#000"><animate attributeName="opacity" values="0;1" dur="6s" repeatCount="indefinite"/></rect>',
  );

  const problems = await ctx.readProblems(svg);

  expect(problems.lastFrameDifference).toBeGreaterThan(0.005);
});

test('#readFrameProblems passes a last frame that matches the first once the ambient loops are removed', async () => {
  const ctx = setupTest();

  const svg = ctx.wrapSVG(
    '<rect width="200" height="100" fill="#000"><animate attributeName="opacity" values="1;0;1" dur="6s" repeatCount="indefinite"/><animate data-ambient="" attributeName="fill-opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/></rect>',
  );

  const problems = await ctx.readProblems(svg);

  expect(problems.lastFrameDifference).toBeUndefined();
});
