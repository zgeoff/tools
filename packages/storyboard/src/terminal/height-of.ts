import { dividerOffset } from './divider-offset.ts';

export const STATUS_H = 26;

export function heightOf(rows: number): number {
  return dividerOffset(rows) + STATUS_H;
}
