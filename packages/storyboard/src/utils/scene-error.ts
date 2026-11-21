export type SceneErrorCode =
  | 'outside-window'
  | 'reading-too-long'
  | 'unknown-reference'
  | 'after-below'
  | 'duplicate-id'
  | 'reserved-id'
  | 'duplicate-mark'
  | 'at-below-change'
  | 'effect-outside-stage'
  | 'nested-stage'
  | 'not-a-part'
  | 'bad-component'
  | 'overlapping-spans'
  | 'ambient-conflict'
  | 'span-crosses-reset'
  | 'conflicting-defs'
  | 'host-not-placed'
  | 'key-times-order'
  | 'bad-scene';

// Every rule that the build enforces throws this, with the rule's code and a message that names
// the change or the part at fault.
export class SceneError extends Error {
  readonly code: SceneErrorCode;

  constructor(code: SceneErrorCode, message: string) {
    super(message);

    this.name = 'SceneError';
    this.code = code;
  }
}
