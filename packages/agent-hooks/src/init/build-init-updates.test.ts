import { expect, test } from 'bun:test';
import { buildInitUpdates } from './build-init-updates.ts';

test('it builds both settings files with a matcher that names each gated tool once', () => {
  const plan = buildInitUpdates({
    stubText: 'await import("@zgeoff/agent-hooks");\n',
    rulesText: JSON.stringify({
      gates: [],
      tools: [
        { tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'] },
        { tool: 'mcp__tracker__update_ticket', skills: ['ticket-style'] },
      ],
    }),
    settingsTexts: {},
  });

  expect(plan).toStrictEqual({
    ok: true,
    updates: [
      { file: '.claude/settings.json', text: expect.toEndWith('}\n') },
      { file: '.codex/hooks.json', text: expect.toEndWith('}\n') },
    ],
  });

  expect(plan).toMatchObject({
    updates: [
      {
        text: expect.toInclude(
          '"matcher": "Edit|Write|MultiEdit|Bash|mcp__tracker__update_ticket"',
        ),
      },
      { text: expect.toInclude('"matcher": "Bash|apply_patch|mcp__tracker__update_ticket"') },
    ],
  });
});

test('it keeps the other keys of a settings file', () => {
  const plan = buildInitUpdates({
    stubText: '',
    rulesText: null,
    settingsTexts: { '.claude/settings.json': '{"model": "sonnet"}' },
  });

  expect(plan).toStrictEqual({
    ok: true,
    updates: [
      {
        file: '.claude/settings.json',
        text: expect.toStartWith('{\n  "model": "sonnet",\n  "hooks"'),
      },
      { file: '.codex/hooks.json', text: expect.toStartWith('{\n  "hooks"') },
    ],
  });
});

test('it refuses when the start-up stub is missing', () => {
  const plan = buildInitUpdates({ stubText: null, rulesText: null, settingsTexts: {} });

  expect(plan).toStrictEqual({
    ok: false,
    error:
      '.claude/hooks/start.ts is missing. Take the hook-start entry of repo-sync and merge its pull request, then run agent-hooks init again.',
  });
});

test('it refuses a broken rules file', () => {
  const plan = buildInitUpdates({ stubText: '', rulesText: '{"gates": {}}', settingsTexts: {} });

  expect(plan).toStrictEqual({
    ok: false,
    error: '.claude/skill-gate.json `gates` must be an array',
  });
});

test('it refuses a settings file that is not JSON', () => {
  const plan = buildInitUpdates({
    stubText: '',
    rulesText: null,
    settingsTexts: { '.codex/hooks.json': '{ "hooks": ' },
  });

  expect(plan).toStrictEqual({
    ok: false,
    error: expect.toStartWith('.codex/hooks.json is not valid JSON: '),
  });
});

test('it refuses a settings file that holds no JSON object', () => {
  const plan = buildInitUpdates({
    stubText: '',
    rulesText: null,
    settingsTexts: { '.claude/settings.json': '["hooks"]' },
  });

  expect(plan).toStrictEqual({
    ok: false,
    error: '.claude/settings.json must hold a JSON object',
  });
});

test('it refuses a settings file whose hooks are not an object', () => {
  const plan = buildInitUpdates({
    stubText: '',
    rulesText: null,
    settingsTexts: { '.claude/settings.json': '{"hooks": []}' },
  });

  expect(plan).toStrictEqual({
    ok: false,
    error: expect.toStartWith('.claude/settings.json: '),
  });
});
