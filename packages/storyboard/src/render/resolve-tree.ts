import { buildAnimatedElement } from '../animation/build-animated-element.ts';
import { buildAnimation, toSpanS } from '../animation/build-animation.ts';
import { buildSceneTime } from '../timeline/build-scene-time.ts';
import { flattenStoryNode, isNodeList } from '../timeline/flatten-story-node.ts';
import type { Timeline } from '../timeline/types.ts';
import type {
  AmbientNode,
  AnimateNode,
  AnimationNode,
  EffectNode,
  ElementNode,
  HostNode,
  StageNode,
  StoryNode,
} from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';

export type Resolved = ElementNode | string | AnimationNode | AmbientNode;

export interface ResolveContext {
  readonly timeline: Timeline;
  readonly defs: Map<string, ElementNode>;
  readonly renderedHosts: Set<HostNode<unknown>>;
  readonly keyCounts: Map<string, number>;
}

export function buildResolveContext(timeline: Timeline): ResolveContext {
  return { timeline, defs: new Map(), renderedHosts: new Set(), keyCounts: new Map() };
}

// The third pass: renders each part with its times into plain elements, gathers every Def, and
// turns the animations that sit inside an element into its SMIL.
export function resolveTree(node: StoryNode, ctx: ResolveContext): Resolved[] {
  if (typeof node === 'string') {
    return [node];
  }

  if (typeof node === 'number') {
    return [String(node)];
  }

  if (isNodeList(node)) {
    return node.flatMap((child: StoryNode) => resolveTree(child, ctx));
  }

  if (typeof node !== 'object' || node === null) {
    return [];
  }

  if (node.node === 'element') {
    return [resolveElement(node, ctx)];
  }

  if (node.node === 'stage') {
    return resolveStage(node, ctx);
  }

  if (node.node === 'host') {
    return resolveHost(node, ctx);
  }

  if (node.node === 'def') {
    collectDef(node.children, ctx);

    return [];
  }

  if (node.node === 'animate') {
    return [resolveAnimate(node, ctx)];
  }

  if (node.node === 'ambient' || node.node === 'animation') {
    return [node];
  }

  if (node.node === 'effect') {
    throw new SceneError('effect-outside-stage', `${node.label} sits outside every <Stage>`);
  }

  throw new SceneError('effect-outside-stage', '<Beat> sits outside every <Stage>');
}

function resolveElement(element: ElementNode, ctx: ResolveContext): ElementNode {
  const resolved = resolveTree(element.children, ctx);
  const content: (ElementNode | string)[] = [];
  const animations: AnimationNode[] = [];
  const ambients: AmbientNode[] = [];

  for (const child of resolved) {
    if (typeof child === 'string' || child.node === 'element') {
      content.push(child);
    } else if (child.node === 'animation') {
      animations.push(child);
    } else {
      ambients.push(child);
    }
  }

  return buildAnimatedElement({ ...element, children: content }, animations, ambients, {
    loopS: ctx.timeline.loopS,
    resetS: ctx.timeline.resetS,
  });
}

function resolveStage(stage: StageNode, ctx: ResolveContext): Resolved[] {
  const parts: EffectNode[] = [];

  for (const child of flattenStoryNode(stage.children)) {
    if (child.node === 'effect') {
      parts.push(child);
    } else if (child.node === 'beat') {
      parts.push(...flattenStoryNode(child.children).filter((part) => part.node === 'effect'));
    }
  }

  return parts.flatMap((part) => {
    const placed = ctx.timeline.placements.get(part);

    if (placed === undefined) {
      return [];
    }

    const time = buildSceneTime(ctx.timeline, nextKey(ctx, part.name), []);

    return resolveTree(part.renderPlaced(placed, time), ctx);
  });
}

function nextKey(ctx: ResolveContext, name: string): string {
  const prefix = name.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
  const count = (ctx.keyCounts.get(prefix) ?? 0) + 1;

  ctx.keyCounts.set(prefix, count);

  return `${prefix}${count}`;
}

function resolveHost(host: HostNode<unknown>, ctx: ResolveContext): Resolved[] {
  ctx.renderedHosts.add(host);

  const time = buildSceneTime(
    ctx.timeline,
    nextKey(ctx, host.kind.name),
    ctx.timeline.acting.get(host) ?? [],
  );

  return resolveTree(host.renderFor(ctx.timeline.session, time), ctx);
}

function collectDef(children: StoryNode, ctx: ResolveContext): void {
  for (const resolved of resolveTree(children, ctx)) {
    if (typeof resolved === 'string') {
      continue;
    }

    if (resolved.node !== 'element') {
      throw new SceneError('bad-component', '<Def> holds an animation outside an element');
    }

    const id = resolved.attributes['id'];
    const key = typeof id === 'object' ? id.name : (id ?? `anonymous${ctx.defs.size}`);
    const existing = ctx.defs.get(String(key));

    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(resolved)) {
      throw new SceneError(
        'conflicting-defs',
        `two <Def>s share the id "${String(key)}" and differ in content`,
      );
    }

    ctx.defs.set(String(key), resolved);
  }
}

function resolveAnimate(animate: AnimateNode, ctx: ResolveContext): AnimationNode {
  if (animate.props.transform !== undefined && animate.props.attribute !== 'transform') {
    throw new SceneError(
      'bad-component',
      `an <Animate> with a transform animates the attribute "transform", not "${animate.props.attribute}"`,
    );
  }

  const atS = ctx.timeline.find(animate.props.at);
  const leadS = animate.props.lead === undefined ? 0 : toSpanS(animate.props.lead);

  return buildAnimation({
    attribute: animate.props.attribute,
    startS: atS - leadS,
    durS: toSpanS(animate.props.span),
    keys: animate.props.keys,
    ...(animate.props.transform === undefined ? {} : { transform: animate.props.transform }),
    ...(animate.props.path === undefined ? {} : { path: animate.props.path }),
  });
}
