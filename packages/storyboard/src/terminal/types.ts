import type { AnimationNode, IDReference, SceneTime, TokenReference } from '../types.ts';

export interface TerminalLineOption {
  readonly text: string;
  readonly tone?: string | undefined;
}

export interface TerminalProps {
  readonly title: string;
  readonly box: { readonly x: number; readonly y: number; readonly width: number };
  readonly opens?: string | undefined;
  readonly status?: string | TerminalLineOption | undefined;
  readonly lines?: readonly (string | TerminalLineOption)[] | undefined;
}

export interface TerminalHelpers {
  readonly color: (name: string) => TokenReference;
  readonly id: (name: string) => IDReference;
  readonly url: (name: string) => IDReference;
}

export type GrowAnimations = (
  attribute: string,
  offset: (rows: number) => number,
) => AnimationNode[];

export interface TerminalContext {
  readonly props: TerminalProps;
  readonly time: SceneTime;
  readonly helpers: TerminalHelpers;
  readonly baseRows: number;
  readonly initialRows: number;
  readonly grow: GrowAnimations;
}
