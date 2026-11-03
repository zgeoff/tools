import type { ScreenLink } from './types.ts';

const linkPattern =
  // oxlint-disable-next-line no-control-regex -- an OSC sequence starts with the ESC control character
  /\u001B\]8;(?<params>[^;\u0007\u001B]*);(?<href>[^\u0007\u001B]+)(?:\u0007|\u001B\\)(?<text>.*?)\u001B\]8;;(?:\u0007|\u001B\\)/gsu;

// Reads the terminal hyperlinks that a program wrote, so a test can assert on where a link points
// and not only on its text.
export function parseOSC8Links(raw: string): ScreenLink[] {
  return [...raw.matchAll(linkPattern)].map((match) => ({
    text: Bun.stripANSI(match.groups?.['text'] ?? ''),
    href: match.groups?.['href'] ?? '',
    params: match.groups?.['params'] ?? '',
  }));
}
