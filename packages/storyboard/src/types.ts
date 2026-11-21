export interface Point {
  readonly x: number;
  readonly y: number;
}

export type TokenValue = string | { readonly dark: string; readonly light: string };

export type BaseTokenName =
  | 'captionText'
  | 'captionLit'
  | 'captionAhead'
  | 'terminalFill'
  | 'terminalStroke'
  | 'text'
  | 'dimText'
  | 'veil'
  | 'teal'
  | 'amber'
  | 'blue'
  | 'violet'
  | 'green';

export interface Tokens<K extends string> {
  readonly values: Readonly<Record<K | BaseTokenName, TokenValue>>;
}

export interface TokenReference {
  readonly node: 'token';
  readonly name: string;
  readonly values: Readonly<Record<string, TokenValue>>;
}

export interface IDReference {
  readonly node: 'id';
  readonly name: string;
  readonly asURL: boolean;
}

export type AttributeValue = string | number | TokenReference | IDReference;

export type Attributes = Readonly<Record<string, AttributeValue | undefined>>;

// A change id, `<id>.<mark>`, `start`, `stage<N>` or `reset`.
export type Reference = string;

export interface After {
  readonly change: Reference;
  readonly steps: number;
}

export interface Steps {
  readonly steps: number;
}

export interface Timing {
  readonly id?: string | undefined;
  readonly after?: After | undefined;
  readonly at?: Reference | undefined;
}

export type TimedProps<P> = P & Timing;

export type StoryNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | StoryElement
  | readonly StoryNode[];

export type StoryElement =
  | ElementNode
  | StageNode
  | BeatNode
  | EffectNode
  | HostNode<unknown>
  | DefNode
  | AnimateNode
  | AmbientNode
  | AnimationNode;

export interface ElementNode {
  readonly node: 'element';
  readonly tag: string;
  readonly attributes: Attributes;
  readonly children: readonly StoryNode[];
}

export interface StageNode {
  readonly node: 'stage';
  readonly caption: string;
  readonly tokens: Readonly<Record<string, TokenValue>>;
  readonly children: StoryNode;
}

export interface BeatNode {
  readonly node: 'beat';
  readonly timing: Timing;
  readonly focus: HostNode<unknown> | undefined;
  readonly children: StoryNode;
}

export interface DefNode {
  readonly node: 'def';
  readonly children: StoryNode;
}

// What a part tells the build before any time exists.
export interface Need {
  // The words a reader reads on this part.
  readonly words?: number;

  // Seconds of motion that end on the change.
  readonly lead?: number;

  // Named instants inside the change, as seconds after it.
  readonly marks?: Readonly<Record<string, number>>;
}

export interface Placed {
  readonly at: number;
  readonly mark: (name: string) => number;
}

export interface ActingSpan {
  readonly fromS: number;
  readonly toS: number;
}

export interface SceneTime {
  readonly loopS: number;
  readonly reset: number;

  // A key that no other host or effect of the scene shares, so a render can build unique ids.
  readonly key: string;

  // The spans in which this host is the acting one.
  readonly acting: readonly ActingSpan[];
  readonly find: (reference: Reference) => number;
  readonly fadeIn: (at: number) => StoryNode;
  readonly fadeOut: (at: number) => StoryNode;
}

export interface Delivery<M> {
  readonly at: number;
  readonly payload: M;
}

// An opaque token of one build, which keys what the hosts collect.
export type Session = object;

export interface HostKind<M> {
  readonly name: string;
  readonly mail?: (() => M) | undefined;
}

// The methods are bivariant on purpose: a handle of a terminal is a handle of `unknown`, which a
// flight accepts, and the mail's `form` keeps one kind of host from passing as another.
export interface HostNode<M> {
  readonly node: 'host';
  readonly kind: HostKind<M>;
  // oxlint-disable-next-line typescript/method-signature-style -- a method is bivariant in `delivery`, so a handle of a terminal passes as a handle of `unknown`
  deliverTo(session: Session, delivery: Delivery<M>): void;
  readonly renderFor: (session: Session, time: SceneTime) => StoryNode;
  readonly findAnchor: () => Point | undefined;
}

export type Host<M> = HostNode<M>;

export interface EffectNode {
  readonly node: 'effect';
  readonly name: string;
  readonly label: string;
  readonly timing: Timing;
  readonly host: HostNode<unknown> | undefined;
  readonly getNeed: () => Need;
  readonly deliverAt: (session: Session, at: number) => void;
  readonly renderPlaced: (placed: Placed, time: SceneTime) => StoryNode;
}

export interface EffectDefinition<P, M> {
  // The component's name in errors.
  readonly name: string;

  // Runs before any time exists, so it reads only its props.
  readonly need: (props: P) => Need;

  // The function that makes its host. With it, the effect takes `on`.
  readonly host?: (props: never) => Host<M>;
  readonly deliver?: (props: P) => M;
  readonly render?: (props: P, placed: Placed, time: SceneTime) => StoryNode;
}

export interface HostDefinition<P, M> {
  readonly name: string;
  readonly render: (props: P, deliveries: readonly Delivery<M>[], time: SceneTime) => StoryNode;
  readonly anchor?: (props: P) => Point;
}

export type Transform = 'translate' | 'scale' | 'rotate';

export type Span = 'fade' | 'cut' | Steps;

export type AnimationKeys = readonly (readonly [fraction: number, value: string | number])[];

export interface AnimateProps {
  readonly attribute: string;
  readonly at: Reference;
  readonly lead?: Span;
  readonly span: Span;
  readonly keys: AnimationKeys;
  readonly transform?: Transform;
  readonly path?: string;
}

export interface AnimateNode {
  readonly node: 'animate';
  readonly props: AnimateProps;
}

export interface AmbientProps {
  readonly attribute: string;
  readonly periodS: number;
  readonly values: readonly (string | number)[];
  readonly keyFractions?: readonly number[];
  readonly ease?: 'linear' | 'smooth';
  readonly phaseS?: number;
  readonly transform?: Transform;
}

export interface AmbientNode {
  readonly node: 'ambient';
  readonly props: AmbientProps;
}

// An animation with its times, which the element it sits inside turns into SMIL.
export interface AnimationNode {
  readonly node: 'animation';
  readonly attribute: string;
  readonly startS: number;
  readonly durS: number;
  readonly keys: AnimationKeys;
  readonly transform: Transform | undefined;
  readonly path: string | undefined;

  // True for an animation that the package itself writes at the reset.
  readonly isInternal: boolean;
}

export interface TerminalLineMail {
  readonly form: 'line';
  readonly head: string;
  readonly text: string;
  readonly tone: string | undefined;
}

export interface TerminalTypeMail {
  readonly form: 'type';
  readonly text: string;
  readonly typingS: number;
  readonly sendsS: number;
}

export interface TerminalStatusMail {
  readonly form: 'status';
  readonly text: string;
  readonly tone: string | undefined;
}

export interface TerminalAlertMail {
  readonly form: 'alert';
  readonly tone: string;
  readonly until: Reference;
}

export type TerminalMail =
  | TerminalLineMail
  | TerminalTypeMail
  | TerminalStatusMail
  | TerminalAlertMail;

export interface StageProps {
  readonly caption: string;
  readonly children?: StoryNode;
}

export interface DefProps {
  readonly children: StoryNode;
}

export interface TerminalBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface TerminalLine<K extends string> {
  readonly text: string;
  readonly tone?: K;
}

export interface TerminalOptions<K extends string> {
  readonly title: string;
  readonly box: TerminalBox;

  // Absent: shown from the first frame.
  readonly opens?: Reference;

  // Its first status. Absent tone: dimText.
  readonly status?: string | TerminalLine<K>;

  // Shown from the first frame.
  readonly lines?: readonly (string | TerminalLine<K>)[];
}

export interface DefineEffect {
  <P, M>(
    definition: EffectDefinition<P, M> & { readonly host: (props: never) => Host<M> },
  ): (props: TimedProps<P & { on: Host<M> }>) => StoryNode;
  <P>(definition: EffectDefinition<P, never>): (props: TimedProps<P>) => StoryNode;
}

export interface SceneKit<K extends string> {
  readonly Stage: (props: StageProps) => StoryNode;
  readonly Beat: (props: TimedProps<{ focus?: Host<unknown>; children: StoryNode }>) => StoryNode;

  readonly buildTerminal: (props: TerminalOptions<K>) => Host<TerminalMail>;

  readonly Line: (
    props: TimedProps<{ on: Host<TerminalMail>; head?: string; tone?: K; children: string }>,
  ) => StoryNode;
  readonly Type: (
    props: TimedProps<{ on: Host<TerminalMail>; typing: Steps; sends: Steps; children: string }>,
  ) => StoryNode;
  readonly Status: (
    props: TimedProps<{ on: Host<TerminalMail>; tone?: K; read?: boolean; children: string }>,
  ) => StoryNode;
  readonly Alert: (
    props: TimedProps<{ on: Host<TerminalMail>; tone: K; until: Reference }>,
  ) => StoryNode;

  readonly Flight: (
    props: TimedProps<
      { from: Host<unknown>; to: Host<unknown>; tone: K } | { path: string; tone: K }
    >,
  ) => StoryNode;
  readonly Pulse: (props: TimedProps<{ stops: readonly Point[]; tone: K }>) => StoryNode;
  readonly Cursor: (
    props: TimedProps<{ from: Point; target: Point; glide: Steps; leaves: Reference }>,
  ) => StoryNode;
  readonly Stamp: (
    props: TimedProps<{ point: Point; tone: K; until: Reference; children: string }>,
  ) => StoryNode;

  readonly Def: (props: DefProps) => StoryNode;
  readonly Animate: (props: AnimateProps) => StoryNode;
  readonly Ambient: (props: AmbientProps) => StoryNode;

  readonly getColor: (token: K) => TokenReference;
  readonly getID: (name: string) => IDReference;
  readonly getURL: (name: string) => IDReference;

  readonly defineHost: <P, M>(definition: HostDefinition<P, M>) => (props: P) => Host<M>;
  readonly defineEffect: DefineEffect;
}

export interface SceneSpec {
  // From the repo root; the build adds `-dark.svg` and `-light.svg`.
  readonly out: string;
  readonly stageS: number;
  readonly card: { readonly width: number; readonly height: number; readonly cornerRadius: number };

  // The file's aria-label.
  readonly description: string;
  readonly styles?: Readonly<Record<string, Readonly<Record<string, AttributeValue>>>>;
  readonly render: () => StoryNode;
}

export interface Scene extends SceneSpec {
  readonly brand: 'storyboard-scene';
}
