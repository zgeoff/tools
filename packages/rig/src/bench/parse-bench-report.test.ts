import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { formatBenchReport } from './format-bench-report.ts';
import { parseBenchReport } from './parse-bench-report.ts';

test('it reads back every entry that the report format writes', () => {
  const definition = defineBench({ name: 'steep', budget: '40ms', run: () => {} });

  const text = formatBenchReport(definition, [
    { concurrency: 1, medianMs: 11.5, spreadMs: 0.7 },
    { concurrency: 4, medianMs: 33.2, spreadMs: 2.4 },
  ]);

  expect(parseBenchReport(text)).toStrictEqual({
    kind: 'parsed',
    entries: [
      { name: 'steep', concurrency: 1, medianMs: 11.5, spreadMs: 0.7, budgetMs: 40 },
      { name: 'steep', concurrency: 4, medianMs: 33.2, spreadMs: 2.4, budgetMs: 40 },
    ],
  });
});

test('it reads no entries from an empty report', () => {
  expect(parseBenchReport('')).toStrictEqual({ kind: 'parsed', entries: [] });
});

test.each([
  ['text that is no JSON', 'the kettle boiled'],
  ['an entry with no median', '{"name":"steep","concurrency":1,"spreadMs":0.7,"budgetMs":40}'],
])('it refuses a report with a line of %s', (_title, line) => {
  expect(parseBenchReport(`${line}\n`)).toStrictEqual({
    kind: 'refused',
    reason: `the bench report holds a line that is no entry: ${line}`,
  });
});
