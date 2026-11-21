import { runInPage } from '@zgeoff/rig';
import { z } from 'zod';
import { collectSVGElements, parseSVG } from '../utils/parse-svg.ts';
import { compareFrames, loadSVG, readPageProblems, showFrame } from './page-functions.ts';
import { parseViewSize } from './parse-view-size.ts';

// A hard cut before the loop's end, which the last frame is compared at.
const HARD_CUT_S = 0.03;
const FRAME_STEP_S = 0.25;
const MAX_DIFFERING_RATIO = 0.005;
const MAX_REPORTED = 5;

export interface FrameProblems {
  readonly overlaps: readonly string[];
  readonly outside: readonly string[];
  readonly lastFrameDifference: number | undefined;
}

const TimeSchema = z.number();
const TextSchema = z.string();
const OverlapSchema = z.object({ timeS: TimeSchema, first: TextSchema, second: TextSchema });
const OutsideSchema = z.object({ timeS: TimeSchema, text: TextSchema });
const FrameResult = z.object({ overlaps: z.array(OverlapSchema), outside: z.array(OutsideSchema) });
const CompareResult = z.object({ differing: z.number(), total: z.number() });

// Reads the problems that the browser suite fails a file for: texts that overlap, texts outside
// the view box, and a last frame that differs from the first.
export async function readFrameProblems(view: Bun.WebView, svg: string): Promise<FrameProblems> {
  const loopS = readLoopS(svg);
  const size = parseViewSize(svg);

  await view.navigate('about:blank');

  // The chrome backend's viewport is shorter than the size the view was made with, by the height
  // of the window frame, so the screenshots only hold the whole file after a resize.
  await view.resize(size.width, size.height);

  const isLoaded = await runInPage(view, loadSVG, { svg }, z.boolean());

  if (!isLoaded) {
    throw new Error('the page holds no <svg>');
  }

  const timesS = Array.from(
    { length: Math.round(loopS / FRAME_STEP_S) },
    (_, index) => index * FRAME_STEP_S,
  );

  const frames = await runInPage(view, readPageProblems, { timesS }, FrameResult);

  await runInPage(view, showFrame, { timeS: 0, isAmbientRemoved: true }, z.number());

  const first = await view.screenshot({ encoding: 'base64' });

  await runInPage(
    view,
    showFrame,
    { timeS: loopS - HARD_CUT_S, isAmbientRemoved: true },
    z.number(),
  );

  const last = await view.screenshot({ encoding: 'base64' });
  const comparison = await runInPage(view, compareFrames, { first, second: last }, CompareResult);

  const ratio = comparison.differing / comparison.total;

  return {
    overlaps: frames.overlaps
      .slice(0, MAX_REPORTED)
      .map((overlap) => `at ${overlap.timeS} s "${overlap.first}" overlaps "${overlap.second}"`),
    outside: frames.outside
      .slice(0, MAX_REPORTED)
      .map((outside) => `at ${outside.timeS} s "${outside.text}" reaches outside the view box`),
    lastFrameDifference: ratio > MAX_DIFFERING_RATIO ? ratio : undefined,
  };
}

// The loop is the duration of the animations that are not ambient.
export function readLoopS(svg: string): number {
  const durations = collectSVGElements(parseSVG(svg))
    .filter((element) => element.attributes['data-ambient'] === undefined)
    .flatMap((element) => {
      const dur = /^(?<seconds>\d+(?:\.\d+)?)s$/u.exec(element.attributes['dur'] ?? '')?.groups?.[
        'seconds'
      ];

      return dur === undefined ? [] : [Number(dur)];
    });

  return Math.max(...durations, FRAME_STEP_S);
}
