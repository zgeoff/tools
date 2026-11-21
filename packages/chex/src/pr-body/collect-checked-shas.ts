import { hexSha } from './hex-sha.ts';
import { parsePrBody } from './parse-pr-body.ts';
import { proseCheckLine } from './prose-check-line.ts';
import { stripPrBody } from './strip-pr-body.ts';

// The commit hashes on the ticked Deslop and Cold read lines, so a caller can read their state.
export function collectCheckedShas(body: string): string[] {
  const parsed = parsePrBody(stripPrBody(body.replaceAll('\r\n', '\n')).text);

  const shas = parsed.sections
    .filter((section) => section.heading === 'Checks')
    .flatMap((section) => section.lines)
    .map((line) => proseCheckLine.exec(line)?.groups?.['sha'] ?? '')
    .filter((sha) => hexSha.test(sha));

  return [...new Set(shas)];
}
