import { parseSVG } from '../utils/parse-svg.ts';

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

// The size of the file's view box.
export function parseViewSize(svg: string): ViewSize {
  const viewBox = parseSVG(svg).attributes['viewBox'] ?? '';
  const numbers = viewBox.split(/\s+/u).map(Number);

  return { width: numbers[2] ?? 800, height: numbers[3] ?? 600 };
}
