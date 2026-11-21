// oxlint-disable zgeoff/file-named-for-export -- the JSX transform names this entry point
import { toElement } from './jsx/build-element.ts';
import type { AttributeValue, StoryElement, StoryNode } from './types.ts';

type SVGAttributes = Readonly<Record<string, AttributeValue | StoryNode | undefined>>;

// The element types leave out animate, animateTransform and animateMotion, so only Animate,
// Ambient and the package's components write SMIL.
type SVGTagName =
  | 'svg'
  | 'g'
  | 'defs'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'path'
  | 'text'
  | 'tspan'
  | 'linearGradient'
  | 'radialGradient'
  | 'stop'
  | 'filter'
  | 'feGaussianBlur'
  | 'feMerge'
  | 'feMergeNode'
  | 'clipPath';

export declare namespace JSX {
  type Element = StoryElement;
  type ElementType = SVGTagName | ((props: never) => StoryNode);
  interface ElementChildrenAttribute {
    children: unknown;
  }
  type IntrinsicElements = Record<SVGTagName, SVGAttributes>;
}

export type JSXProps = Readonly<Record<string, AttributeValue | StoryNode | undefined>>;

export interface FragmentProps {
  readonly children?: StoryNode;
}

// A function component runs here, once, so the tree that comes back holds no function.
export function jsx(type: string | ((props: never) => StoryNode), props: JSXProps): StoryNode {
  if (typeof type === 'string') {
    return toElement(type, props);
  }

  const result: StoryNode = Reflect.apply(type, undefined, [props]);

  return result;
}

export const jsxs = jsx;

export function Fragment(props: FragmentProps): StoryNode {
  return props.children;
}
