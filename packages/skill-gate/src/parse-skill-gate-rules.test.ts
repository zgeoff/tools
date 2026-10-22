import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
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
    tools: [],
    unknownKeys: [],
  });
});

test('it reads a missing ignore list as no ignore segments', () => {
  const text = JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: true,
    rules: { ignore: [], gates: [{ match: '**/*.md', skills: ['docs-writing'] }] },
    tools: [],
    unknownKeys: [],
  });
});

test('it rejects text that is not JSON', () => {
  const result = parseSkillGateRules('{ "gates": [');

  invariant(!result.ok, 'expected the parser to reject the text');

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

test('it accepts tool gates and reads a missing skills or references list as empty', () => {
  const text = JSON.stringify({
    gates: [],
    tools: [
      {
        tool: 'mcp__tracker__update_ticket',
        skills: ['ticket-review'],
        references: ['ticket-review/references/reasons.md'],
      },
      { tool: 'mcp__tracker__close_ticket', references: ['ticket-review/references/closing.md'] },
      { tool: 'mcp__tracker__open_ticket', skills: ['ticket-review'] },
    ],
  });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: true,
    rules: { ignore: [], gates: [] },
    tools: [
      {
        tool: 'mcp__tracker__update_ticket',
        skills: ['ticket-review'],
        references: ['ticket-review/references/reasons.md'],
      },
      {
        tool: 'mcp__tracker__close_ticket',
        skills: [],
        references: ['ticket-review/references/closing.md'],
      },
      { tool: 'mcp__tracker__open_ticket', skills: ['ticket-review'], references: [] },
    ],
    unknownKeys: [],
  });
});

test('it skips and names each key it does not know, at the top level and inside a gate', () => {
  const text = JSON.stringify({
    gates: [{ match: '**/*.md', skills: ['docs-writing'], severity: 'warn' }],
    tools: [{ tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'], timeout: 5 }],
    commands: [{ command: 'git push', skills: ['ci-design'] }],
  });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: true,
    rules: { ignore: [], gates: [{ match: '**/*.md', skills: ['docs-writing'] }] },
    tools: [{ tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'], references: [] }],
    unknownKeys: ['commands', 'gates[0].severity', 'tools[0].timeout'],
  });
});

test('it rejects a tools value that is not an array', () => {
  expect(parseSkillGateRules(JSON.stringify({ gates: [], tools: {} }))).toStrictEqual({
    ok: false,
    error: '`tools` must be an array',
  });
});

test('it rejects a tool gate without a tool', () => {
  const text = JSON.stringify({ gates: [], tools: [{ skills: ['ticket-review'] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'tool gate 0 needs a non-empty string `tool`',
  });
});

test('it rejects a tool gate with neither skills nor references', () => {
  const text = JSON.stringify({ gates: [], tools: [{ tool: 'mcp__tracker__update_ticket' }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'tool gate "mcp__tracker__update_ticket" needs at least one skill or reference',
  });
});

test('it rejects a tool gate whose references hold an empty string', () => {
  const text = JSON.stringify({
    gates: [],
    tools: [{ tool: 'mcp__tracker__update_ticket', references: [''] }],
  });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error:
      'tool gate "mcp__tracker__update_ticket" needs `skills` and `references` arrays of non-empty strings',
  });
});

test('it rejects a tool gate on a tool that path gates cover', () => {
  const text = JSON.stringify({ gates: [], tools: [{ tool: 'Edit', skills: ['code-style'] }] });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error: 'tool gate "Edit" names a tool that path gates cover; gate its paths in `gates`',
  });
});

test('it rejects a reference that climbs out of .claude/skills', () => {
  const text = JSON.stringify({
    gates: [],
    tools: [{ tool: 'mcp__tracker__update_ticket', references: ['../notes/reasons.md'] }],
  });

  expect(parseSkillGateRules(text)).toStrictEqual({
    ok: false,
    error:
      'tool gate "mcp__tracker__update_ticket" names the reference "../notes/reasons.md", which is not a path inside .claude/skills/',
  });
});
