/* @jsxImportSource @zgeoff/storyboard */
import { expect, test } from 'bun:test';
import { buildSceneKit } from './components/build-scene-kit.ts';
import { defineTokens } from './tokens/define-tokens.ts';

function setupTest() {
  const kit = buildSceneKit(defineTokens({ sky: '#151b33' }));

  const note = kit.defineHost<{ title: string }, { text: string }>({
    name: 'note',
    render: () => [],
  });

  return {
    kit,
    terminal: kit.buildTerminal({ title: 't', box: { x: 0, y: 0, width: 100 } }),
    note,
  };
}

test('it rejects, at type check, a token name that the scene does not define', () => {
  const ctx = setupTest();

  // @ts-expect-error -- 'nothing' is no base token and no token of this scene
  const color = ctx.kit.getColor('nothing');

  expect(color).toMatchObject({ name: 'nothing' });
});

test('it accepts, at type check, a token name that the scene defines', () => {
  const ctx = setupTest();

  expect(ctx.kit.getColor('sky')).toMatchObject({ name: 'sky' });
});

test('it rejects, at type check, a Line sent to a host of another kind', () => {
  const ctx = setupTest();
  const note = ctx.note({ title: 'n' });

  // @ts-expect-error -- a Line writes to a terminal, and a note is another kind of host
  const line = <ctx.kit.Line on={note}>hello</ctx.kit.Line>;

  expect(line).toBeDefined();
});

test('it rejects, at type check, an animate element in JSX', () => {
  // @ts-expect-error -- the element types leave out animate, so only Animate and Ambient make SMIL
  const element = <animate attributeName="opacity" />;

  expect(element).toBeDefined();
});

test('it rejects, at type check, an animateTransform element in JSX', () => {
  // @ts-expect-error -- the element types leave out animateTransform
  const element = <animateTransform attributeName="transform" />;

  expect(element).toBeDefined();
});

test('it rejects, at type check, an animateMotion element in JSX', () => {
  // @ts-expect-error -- the element types leave out animateMotion
  const element = <animateMotion path="M0 0" />;

  expect(element).toBeDefined();
});
