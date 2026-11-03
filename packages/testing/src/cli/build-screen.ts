import { collapseTTYFrames } from './collapse-tty-frames.ts';
import { parseOSC8Links } from './parse-osc8-links.ts';
import type { FindByTextOptions, Screen, TextPattern } from './types.ts';

const defaultFindTimeoutMs = 5000;
const findIntervalMs = 25;

// The queries over the bytes a program has written to its terminal so far. `getOutput` is called
// on each query, so a query sees what the program wrote since the last one.
export function buildScreen(getOutput: () => string): Screen {
  const getText = () => collapseTTYFrames(getOutput());

  const getAllByText = (pattern: TextPattern): string[] =>
    getText()
      .split('\n')
      .filter((line) => isMatch(line, pattern));

  const queryByText = (pattern: TextPattern): string | null => getAllByText(pattern)[0] ?? null;

  const buildMiss = (pattern: TextPattern): Error =>
    new Error(`no line on the screen matches ${String(pattern)}; the screen:\n${getText()}`);

  return {
    getByText: (pattern) => {
      const line = queryByText(pattern);

      if (line === null) {
        throw buildMiss(pattern);
      }

      return line;
    },
    queryByText,
    // oxlint-disable-next-line zgeoff/verb-contract -- the name follows the testing-library queries
    findByText: async (pattern, options: FindByTextOptions = {}) => {
      const deadline = Date.now() + (options.timeoutMs ?? defaultFindTimeoutMs);
      let line = queryByText(pattern);

      while (line === null && Date.now() < deadline) {
        await Bun.sleep(findIntervalMs);

        line = queryByText(pattern);
      }

      if (line === null) {
        throw buildMiss(pattern);
      }

      return line;
    },
    getAllByText,
    text: getText,
    links: () => parseOSC8Links(getOutput()),
  };
}

function isMatch(line: string, pattern: TextPattern): boolean {
  if (typeof pattern === 'string') {
    return line.includes(pattern);
  }

  // A global or sticky pattern moves lastIndex on each test, so a later query would skip a match.
  pattern.lastIndex = 0;

  return pattern.test(line);
}
