import { rowBaseline } from './row-baseline.ts';

// The status divider sits 9 under the last baseline.
export function dividerOffset(rows: number): number {
  const gapBelow = 9;

  return rowBaseline(rows - 1) + gapBelow;
}
