import { parseTextList } from './parse-text-list.ts';
import { parseTextRecord } from './parse-text-record.ts';

export type ParsedReleaseOutputs =
  | {
      readonly kind: 'parsed';
      readonly outputs: Readonly<Record<string, string>>;
      readonly paths: readonly string[];
    }
  | { readonly kind: 'invalid'; readonly message: string };

// release-please's outputs reach a step as the JSON of a step's outputs object, where every value
// is text and paths_released is itself a JSON array in text.
export function parseReleaseOutputs(text: string): ParsedReleaseOutputs {
  const outputs = parseTextRecord(text);

  if (outputs === null) {
    return { kind: 'invalid', message: 'the release outputs hold no JSON object of text values' };
  }

  const paths = parseTextList(outputs['paths_released'] ?? '[]');

  if (paths === null) {
    return { kind: 'invalid', message: 'paths_released holds no JSON array of paths' };
  }

  return { kind: 'parsed', outputs, paths };
}
