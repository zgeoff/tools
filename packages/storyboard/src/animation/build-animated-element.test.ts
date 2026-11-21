import { expect, test } from 'bun:test';
import type { AmbientNode, AnimationNode, ElementNode } from '../types.ts';
import { buildAnimatedElement } from './build-animated-element.ts';

function setupTest() {
  const element: ElementNode = { node: 'element', tag: 'g', attributes: {}, children: [] };
  const timing = { loopS: 10, resetS: 9 };

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- a test file declares only setupTest
  const buildAmbient = (props: Partial<AmbientNode['props']>): AmbientNode => ({
    node: 'ambient',
    props: { attribute: 'opacity', periodS: 2, values: [0, 1], ...props },
  });

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- a test file declares only setupTest
  const buildAnimation = (overrides: Partial<AnimationNode>): AnimationNode => ({
    node: 'animation',
    attribute: 'opacity',
    startS: 1,
    durS: 1,
    keys: [
      [0, 0],
      [1, 1],
    ],
    transform: undefined,
    path: undefined,
    isInternal: false,
    ...overrides,
  });

  return { element, timing, buildAmbient, buildAnimation };
}

test('#buildAnimatedElement fails an Animate and an Ambient on the same attribute', () => {
  const ctx = setupTest();

  expect(() =>
    buildAnimatedElement(ctx.element, [ctx.buildAnimation({})], [ctx.buildAmbient({})], ctx.timing),
  ).toThrowWithMessage(Error, /share the attribute "opacity"/u);
});

test('#buildAnimatedElement fails a transform Animate and a transform Ambient on one element', () => {
  const ctx = setupTest();

  expect(() =>
    buildAnimatedElement(
      ctx.element,
      [ctx.buildAnimation({ attribute: 'transform', transform: 'translate' })],
      [ctx.buildAmbient({ attribute: 'transform', transform: 'rotate' })],
      ctx.timing,
    ),
  ).toThrowWithMessage(Error, /both move the transform/u);
});
