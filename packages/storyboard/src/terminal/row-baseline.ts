export const ROW_H = 19;
export const HEADER_H = 25;

// The first baseline sits 18 under the title bar, and each row after it one row lower.
export function rowBaseline(index: number): number {
  const firstBaseline = 18;

  return HEADER_H + firstBaseline + ROW_H * index;
}
