import { expect, test } from 'bun:test';
import { parseSkillGateRules } from './parse-skill-gate-rules.ts';

test('it accepts ignore segments and gates', () => {
  const text = JSON.stringify({
    ignore: ['node_modules/', '.generated.'],
    gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }],
  });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: true,
    rules: {
      ignore: ['node_modules/', '.generated.'],
      gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }],
    },
  });
});

test('it reads a missing ignore list as no ignore segments', () => {
  const text = JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: true,
    rules: { ignore: [], gates: [{ match: '**/*.md', skills: ['docs-writing'] }] },
  });
});

test('it rejects text that is not JSON', () => {
  const result = parseSkillGateRules('{ "gates": [');

  if (result.ok) {
    throw new Error('expected the parser to reject the text');
  }

  expect(result.error).toStartWith('is not valid JSON: ');
});

test('it rejects a file without a gates array', () => {
  expect(parseSkillGateRules(JSON.stringify({ ignore: [] }))).toStrictEqual({
    ok: false,
    error: '`gates` must be an array',
  });
});

test('it rejects an ignore list that holds a non-string', () => {
  const text = JSON.stringify({ ignore: ['dist/', 3], gates: [] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: '`ignore` must be an array of non-empty strings',
  });
});

test('it rejects a gate without a match', () => {
  const text = JSON.stringify({ gates: [{ skills: ['testing'] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'gate 0 needs a non-empty string `match`',
  });
});

test('it rejects a gate with no skills', () => {
  const text = JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: [] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'gate "**/*.test.ts" needs a non-empty `skills` array of non-empty strings',
  });
});

test('it rejects a JSON value that is not an object', () => {
  expect(parseSkillGateRules('[]')).toStrictEqual({ ok: false, error: 'must hold a JSON object' });
});

test('it rejects an empty ignore segment, which would match every path', () => {
  const text = JSON.stringify({ ignore: [''], gates: [] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: '`ignore` must be an array of non-empty strings',
  });
});

test('it rejects an empty skill name', () => {
  const text = JSON.stringify({ gates: [{ match: '**/*.md', skills: [''] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'gate "**/*.md" needs a non-empty `skills` array of non-empty strings',
  });
});
