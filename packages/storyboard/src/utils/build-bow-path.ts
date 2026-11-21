import type { Point } from '../types.ts';
import { formatNumber } from './format-number.ts';

// A curved path between two points: a quadratic curve bowed to the left of the way from one to
// the other, by a quarter of the distance.
export function buildBowPath(from: Point, to: Point): string {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const controlX = from.x + deltaX / 2 + deltaY * 0.25;
  const controlY = from.y + deltaY / 2 - deltaX * 0.25;

  return `M${formatNumber(from.x)} ${formatNumber(from.y)} Q${formatNumber(controlX)} ${formatNumber(controlY)} ${formatNumber(to.x)} ${formatNumber(to.y)}`;
}
