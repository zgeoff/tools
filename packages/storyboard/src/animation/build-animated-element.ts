import type { AmbientNode, AnimationNode, Attributes, ElementNode, Transform } from '../types.ts';
import { formatKeyTime, formatNumber } from '../utils/format-number.ts';
import { SceneError } from '../utils/scene-error.ts';
import { buildFrames, formatFrames, formatValue } from './build-frames.ts';

interface LoopTiming {
  readonly loopS: number;
  readonly resetS: number;
}

// Writes the SMIL of one element: one animate for each attribute that spans act on, one wrapper
// `<g>` for each span that moves the element by a transform or along a path, and one animate for
// each ambient loop.
export function buildAnimatedElement(
  element: ElementNode,
  animations: readonly AnimationNode[],
  ambients: readonly AmbientNode[],
  timing: LoopTiming,
): ElementNode {
  if (animations.length === 0 && ambients.length === 0) {
    return element;
  }

  const plain = animations.filter((animation) => !isWrapped(animation));
  const wrapped = animations.filter((animation) => isWrapped(animation));
  const plainAmbients = ambients.filter((ambient) => ambient.props.transform === undefined);
  const wrappedAmbients = ambients.filter((ambient) => ambient.props.transform !== undefined);

  checkAmbientConflicts(plain, plainAmbients);
  checkTransformConflicts(animations, ambients);

  const animateElements = [
    ...buildPlainAnimates(element, plain, timing),
    ...plainAmbients.map((ambient) => buildAmbientElement(ambient)),
  ];

  const wrappers = [
    ...wrapped.map((animation) => buildWrapperAnimation(animation, timing)),
    ...wrappedAmbients.map((ambient) => buildAmbientElement(ambient)),
  ];

  let result: ElementNode = {
    ...element,
    children: [...animateElements, ...element.children],
  };

  for (const wrapper of wrappers.toReversed()) {
    result = { node: 'element', tag: 'g', attributes: {}, children: [wrapper, result] };
  }

  return result;
}

function isWrapped(animation: AnimationNode): boolean {
  return animation.transform !== undefined || animation.path !== undefined;
}

function checkAmbientConflicts(
  plain: readonly AnimationNode[],
  ambients: readonly AmbientNode[],
): void {
  const animated = new Set(plain.map((animation) => animation.attribute));

  for (const ambient of ambients) {
    if (animated.has(ambient.props.attribute)) {
      throw new SceneError(
        'ambient-conflict',
        `an Ambient and an Animate share the attribute "${ambient.props.attribute}" of one element`,
      );
    }
  }
}

function checkTransformConflicts(
  animations: readonly AnimationNode[],
  ambients: readonly AmbientNode[],
): void {
  const isAnimated = animations.some(
    (animation) => animation.transform !== undefined || animation.attribute === 'transform',
  );

  const isAmbient = ambients.some(
    (ambient) => ambient.props.transform !== undefined || ambient.props.attribute === 'transform',
  );

  if (isAnimated && isAmbient) {
    throw new SceneError(
      'ambient-conflict',
      'an Ambient and an Animate both move the transform of one element',
    );
  }
}

function buildPlainAnimates(
  element: ElementNode,
  plain: readonly AnimationNode[],
  timing: LoopTiming,
): ElementNode[] {
  const groups = new Map<string, AnimationNode[]>();

  for (const animation of plain) {
    groups.set(animation.attribute, [...(groups.get(animation.attribute) ?? []), animation]);
  }

  return [...groups].map(([attribute, spans]) => {
    const describe = `the attribute "${attribute}" of <${element.tag}>`;
    const [first] = spans.toSorted((left, right) => left.startS - right.startS);
    const base = element.attributes[attribute];
    const firstValue = pickFirstValue(base, first, describe);

    const frames = buildFrames({
      firstValue,
      animations: spans,
      loopS: timing.loopS,
      resetS: timing.resetS,
      isMotion: false,
      describe,
    });

    const formatted = formatFrames(frames, timing.loopS, describe);

    return buildAnimateElement('animate', { attributeName: attribute }, timing.loopS, {
      values: formatted.values,
      keyTimes: formatted.keyTimes,
    });
  });
}

function pickFirstValue(
  base: Attributes[string],
  first: AnimationNode | undefined,
  describe: string,
): string {
  if (typeof base === 'object') {
    throw new SceneError(
      'bad-component',
      `${describe} holds a reference, which no span can animate`,
    );
  }

  if (base !== undefined) {
    return formatValue(base, false);
  }

  const firstKey = first?.keys[0];

  return firstKey === undefined ? '0' : formatValue(firstKey[1], false);
}

function buildAnimateElement(
  tag: string,
  head: Attributes,
  loopS: number,
  tail: Attributes,
): ElementNode {
  return {
    node: 'element',
    tag,
    attributes: { ...head, dur: `${formatNumber(loopS)}s`, repeatCount: 'indefinite', ...tail },
    children: [],
  };
}

const SMOOTH_SPLINE = '0.42 0 0.58 1';

function buildAmbientElement(ambient: AmbientNode): ElementNode {
  const settings = ambient.props;
  const count = settings.values.length;

  const fractions =
    settings.keyFractions ??
    settings.values.map((_, index) => (count === 1 ? 0 : index / (count - 1)));

  const isSmooth = settings.ease === 'smooth';
  const transform: Transform | undefined = settings.transform;

  const head: Attributes =
    transform === undefined
      ? { attributeName: settings.attribute }
      : { attributeName: 'transform', type: transform };

  return {
    node: 'element',
    tag: transform === undefined ? 'animate' : 'animateTransform',
    attributes: {
      ...head,
      dur: `${formatNumber(settings.periodS)}s`,
      repeatCount: 'indefinite',
      ...(settings.phaseS === undefined || settings.phaseS === 0
        ? {}
        : { begin: `-${formatNumber(settings.phaseS)}s` }),
      ...(isSmooth
        ? {
            calcMode: 'spline',
            keySplines: Array.from({ length: Math.max(count - 1, 1) }, () => SMOOTH_SPLINE).join(
              ';',
            ),
          }
        : {}),
      values: settings.values.map((value) => formatValue(value, false)).join(';'),
      keyTimes: fractions.map((fraction) => formatKeyTime(fraction)).join(';'),
      'data-ambient': '',
    },
    children: [],
  };
}

function buildWrapperAnimation(animation: AnimationNode, timing: LoopTiming): ElementNode {
  const isMotion = animation.path !== undefined;
  const describe = `a ${isMotion ? 'path' : (animation.transform ?? 'transform')} span`;
  const [firstKey] = animation.keys;

  const frames = buildFrames({
    firstValue: firstKey === undefined ? '0' : formatValue(firstKey[1], isMotion),
    animations: [animation],
    loopS: timing.loopS,
    resetS: timing.resetS,
    isMotion,
    describe,
  });

  const formatted = formatFrames(frames, timing.loopS, describe);

  if (animation.path !== undefined) {
    return buildAnimateElement('animateMotion', {}, timing.loopS, {
      calcMode: 'linear',
      keyPoints: formatted.values,
      keyTimes: formatted.keyTimes,
      path: animation.path,
    });
  }

  return buildAnimateElement(
    'animateTransform',
    { attributeName: 'transform', type: animation.transform },
    timing.loopS,
    { values: formatted.values, keyTimes: formatted.keyTimes },
  );
}
