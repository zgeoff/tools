/* @jsxImportSource @zgeoff/storyboard */
import { expect, test } from 'bun:test';
import { buildSceneKit } from '../components/build-scene-kit.ts';
import { defineTokens } from '../tokens/define-tokens.ts';
import type { Scene } from '../types.ts';
import { defineScene } from './define-scene.ts';
import { renderSceneFiles } from './render-scene-files.ts';

interface TokenPair {
  readonly dark: string;
  readonly light: string;
}

function setupTest() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- a test file declares only setupTest
  const buildScene = (tokenValues: TokenPair, caption = 'One.'): Scene => {
    const kit = buildSceneKit(defineTokens({ sky: tokenValues }));
    const Stage = kit.Stage;
    const Line = kit.Line;
    const Def = kit.Def;
    const host = kit.buildTerminal({ title: 'host', box: { x: 20, y: 20, width: 300 } });

    const gradient = (
      <linearGradient id={kit.getID('fade')}>
        <stop offset="0" stop-color={kit.getColor('teal')} />
      </linearGradient>
    );

    return defineScene({
      out: 'docs/assets/demo',
      stageS: 6,
      card: { width: 400, height: 200, cornerRadius: 8 },
      description: 'A demo scene.',
      render: () => (
        <>
          <Def>{gradient}</Def>
          <Def>{gradient}</Def>
          <rect width="400" height="200" fill={kit.getColor('sky')} />
          {host}
          <Stage caption={caption}>
            <Line on={host}>{'a < b & c'}</Line>
          </Stage>
        </>
      ),
    });
  };

  return { buildScene };
}

test('#renderSceneFiles writes two files that differ only in the paired token values', () => {
  const ctx = setupTest();
  const files = renderSceneFiles(ctx.buildScene({ dark: '#101010', light: '#fafafa' }), 'demo');

  expect(files.dark).toInclude('fill="#101010"');
  expect(files.light).toInclude('fill="#fafafa"');

  expect(files.dark.replaceAll(/#[0-9a-f]{6}/gu, '#')).toBe(
    files.light.replaceAll(/#[0-9a-f]{6}/gu, '#'),
  );
});

test('#renderSceneFiles gives the same bytes on a second build', () => {
  const ctx = setupTest();
  const scene = ctx.buildScene({ dark: '#101010', light: '#fafafa' });

  expect(renderSceneFiles(scene, 'demo')).toStrictEqual(renderSceneFiles(scene, 'demo'));
});

test('#renderSceneFiles escapes the text once', () => {
  const ctx = setupTest();
  const files = renderSceneFiles(ctx.buildScene({ dark: '#101010', light: '#fafafa' }), 'demo');

  expect(files.dark).toInclude('a &lt; b &amp; c');
  expect(files.dark).not.toInclude('&amp;lt;');
});

test('#renderSceneFiles gathers every Def into one defs element and merges equal ones', () => {
  const ctx = setupTest();
  const files = renderSceneFiles(ctx.buildScene({ dark: '#101010', light: '#fafafa' }), 'demo');

  expect(files.dark.match(/<defs>/gu)).toHaveLength(1);
  expect(files.dark.match(/<linearGradient /gu)).toHaveLength(1);
});

test('#renderSceneFiles keeps the SMIL element names and writes keyTimes to 4 decimals', () => {
  const ctx = setupTest();
  const files = renderSceneFiles(ctx.buildScene({ dark: '#101010', light: '#fafafa' }), 'demo');

  const keyTimes = [...files.dark.matchAll(/keyTimes="(?<times>[^"]*)"/gu)].flatMap((found) =>
    (found.groups?.['times'] ?? '').split(';'),
  );

  expect(files.dark).toInclude('<animate ');
  expect(keyTimes).toSatisfyAll((value: string) => /^\d\.\d{4}$/u.test(value));
});
