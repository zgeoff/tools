import type { AnimationNode } from '../types.ts';
import { formatKeyTime, formatNumber, formatPrecise } from '../utils/format-number.ts';
import { SceneError } from '../utils/scene-error.ts';
import { FADE_S } from './constants.ts';

export interface Frame {
  readonly timeS: number;
  readonly value: string;
}

interface FrameInput {
  readonly firstValue: string;
  readonly animations: readonly AnimationNode[];
  readonly loopS: number;
  readonly resetS: number;
  readonly isMotion: boolean;
  readonly describe: string;
}

// Merges the spans of one attribute into the frames of one SMIL element. Before the first span the
// attribute holds its first value, after each span it holds that span's last value, and at the
// reset it returns to its first value.
export function buildFrames(input: FrameInput): Frame[] {
  const spans = checkSpans(input);
  const frames: Frame[] = [];
  let current = input.firstValue;

  pushFrame(frames, 0, current);

  for (const span of spans) {
    pushFrame(frames, span.startS, current);

    for (const [fraction, value] of span.keys) {
      current = formatValue(value, input.isMotion);

      pushFrame(frames, span.startS + fraction * span.durS, current);
    }
  }

  if (current !== input.firstValue) {
    pushFrame(frames, input.resetS, current);
    pushFrame(frames, input.resetS + FADE_S, input.firstValue);

    current = input.firstValue;
  }

  pushFrame(frames, input.loopS, current);

  return dropRedundantFrames(frames);
}

export function formatFrames(
  frames: readonly Frame[],
  loopS: number,
  describe: string,
): { values: string; keyTimes: string } {
  const keyTimes = frames.map((frame) => formatKeyTime(frame.timeS / loopS));

  for (let index = 1; index < keyTimes.length; index += 1) {
    if (Number(keyTimes[index]) < Number(keyTimes[index - 1])) {
      throw new SceneError(
        'key-times-order',
        `rounding puts two keyTimes out of order on ${describe}`,
      );
    }
  }

  return { values: frames.map((frame) => frame.value).join(';'), keyTimes: keyTimes.join(';') };
}

export function formatValue(value: string | number, isMotion: boolean): string {
  if (typeof value === 'string') {
    return value;
  }

  return isMotion ? formatPrecise(value) : formatNumber(value);
}

function checkSpans(input: FrameInput): AnimationNode[] {
  const spans = input.animations.toSorted((first, second) => first.startS - second.startS);

  for (const [index, span] of spans.entries()) {
    const endS = span.startS + span.durS;

    if (!span.isInternal && span.startS < input.resetS && endS > input.resetS) {
      throw new SceneError('span-crosses-reset', `a span of ${input.describe} crosses the reset`);
    }

    const previous = spans[index - 1];

    if (previous !== undefined && span.startS < previous.startS + previous.durS - 1e-9) {
      throw new SceneError('overlapping-spans', `two spans of ${input.describe} overlap`);
    }
  }

  return spans;
}

function pushFrame(frames: Frame[], rawTimeS: number, value: string): void {
  const timeS = Math.round(rawTimeS * 1e6) / 1e6;
  const last = frames.at(-1);

  if (last !== undefined && last.timeS === timeS && last.value === value) {
    return;
  }

  if (frames.length === 1 && timeS === 0 && last !== undefined) {
    frames[0] = { timeS, value };

    return;
  }

  frames.push({ timeS, value });
}

function dropRedundantFrames(frames: readonly Frame[]): Frame[] {
  return frames.filter((frame, index) => {
    const before = frames[index - 1];
    const after = frames[index + 1];

    return !(before?.value === frame.value && after?.value === frame.value);
  });
}
