import { buildTimeline } from '../timeline/build-timeline.ts';
import type { ElementNode, Scene, TokenReference } from '../types.ts';
import { formatNumber } from '../utils/format-number.ts';
import { SceneError } from '../utils/scene-error.ts';
import { CAPTION_BAND_HEIGHT, buildCaptionBand } from './build-caption-band.ts';
import { buildStyleText } from './build-style-text.ts';
import { buildResolveContext, resolveTree } from './resolve-tree.ts';
import { escapeAttribute, serializeNode } from './serialize-node.ts';
import type { Mode } from './serialize-node.ts';

export interface SceneFiles {
  readonly dark: string;
  readonly light: string;
}

// Renders the scene's tree once, then writes it twice: with the dark and with the light value of
// each token.
export function renderSceneFiles(scene: Scene, sceneName: string): SceneFiles {
  const tree = buildSceneTree(scene);

  return {
    dark: formatSceneFile({ scene, tree, sceneName, mode: 'dark' }),
    light: formatSceneFile({ scene, tree, sceneName, mode: 'light' }),
  };
}

interface SceneTree {
  readonly parts: readonly ElementNode[];
  readonly width: number;
  readonly height: number;
}

function buildSceneTree(scene: Scene): SceneTree {
  if (!(scene.stageS > 0) || scene.stageS % 0.5 !== 0) {
    throw new SceneError(
      'bad-scene',
      `stageS is ${scene.stageS}, and it must be a positive multiple of 0.5`,
    );
  }

  const root = scene.render();
  const timeline = buildTimeline(root, scene.stageS);
  const ctx = buildResolveContext(timeline);
  const resolved = resolveTree(root, ctx);

  for (const host of timeline.writtenHosts) {
    if (!ctx.renderedHosts.has(host)) {
      throw new SceneError(
        'host-not-placed',
        `a ${host.kind.name} host receives parts but sits nowhere in the scene's tree`,
      );
    }
  }

  const content: (ElementNode | string)[] = [];

  for (const child of resolved) {
    if (typeof child === 'string' || child.node === 'element') {
      content.push(child);
    } else {
      throw new SceneError(
        'bad-component',
        'an <Animate> or an <Ambient> sits outside every element',
      );
    }
  }

  const color = (name: string): TokenReference => ({
    node: 'token',
    name,
    values: timeline.tokens,
  });

  const cardClip = buildResolvedElement(
    'clipPath',
    { id: { node: 'id', name: 'card', asURL: false } },
    [
      buildResolvedElement(
        'rect',
        { width: scene.card.width, height: scene.card.height, rx: scene.card.cornerRadius },
        [],
      ),
    ],
  );

  const defs = buildResolvedElement('defs', {}, [cardClip, ...ctx.defs.values()]);

  const band = buildResolvedElement(
    'g',
    {},
    buildCaptionBand({ timeline, width: scene.card.width, color }),
  );

  const clipped = buildResolvedElement(
    'g',
    { 'clip-path': { node: 'id', name: 'card', asURL: true } },
    content,
  );

  const card = buildResolvedElement('g', { transform: `translate(0 ${CAPTION_BAND_HEIGHT})` }, [
    clipped,
  ]);

  return {
    parts: [defs, band, card],
    width: scene.card.width,
    height: scene.card.height + CAPTION_BAND_HEIGHT,
  };
}

// The tree is resolved by now, so its children are the elements themselves, with no wrapper.
function buildResolvedElement(
  tag: string,
  attributes: ElementNode['attributes'],
  children: ElementNode['children'],
): ElementNode {
  return { node: 'element', tag, attributes, children };
}

interface FileInput {
  readonly scene: Scene;
  readonly tree: SceneTree;
  readonly sceneName: string;
  readonly mode: Mode;
}

function formatSceneFile(input: FileInput): string {
  const options = { mode: input.mode, sceneName: input.sceneName };
  const width = formatNumber(input.tree.width);
  const height = formatNumber(input.tree.height);

  const body = input.tree.parts
    .map((part) => `  ${serializeNode(part, options, true).replaceAll('\n', '\n  ')}`)
    .join('\n');

  const label = escapeAttribute(input.scene.description);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">`,
    `  <style>\n${buildStyleText(input.scene.styles, options)}\n  </style>`,
    body,
    '</svg>',
    '',
  ].join('\n');
}
