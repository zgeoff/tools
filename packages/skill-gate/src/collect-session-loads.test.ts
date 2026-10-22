import { expect, test } from 'bun:test';
import { collectSessionLoads } from './collect-session-loads.ts';

test('it collects every skill a successful Skill tool call loaded', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"next"},{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing","args":"review"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['testing', 'project-testing'],
    readPaths: [],
    compacted: false,
  });
});

test('it ignores a Skill tool call that failed', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":true,"content":"The user denied the call"}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: false,
  });
});

test('it ignores a Skill tool call that has no result yet', () => {
  const transcript =
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}';

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: false,
  });
});

test('it collects a skill the user loaded with a slash command', () => {
  const transcript = String.raw`{"type":"user","message":{"role":"user","content":"<command-name>/docs-writing</command-name>\n<command-message>docs-writing</command-message>"}}`;

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['docs-writing'],
    readPaths: [],
    compacted: false,
  });
});

test('it collects a slash command whose message tag comes first', () => {
  const transcript = String.raw`{"type":"user","message":{"role":"user","content":"<command-message>testing is running…</command-message>\n<command-name>/testing</command-name>"}}`;

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['testing'],
    readPaths: [],
    compacted: false,
  });
});

test('it ignores a load that a compaction boundary summarized away', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"code-style"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: code-style"}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['code-style'],
    readPaths: [],
    compacted: true,
  });
});

test('it reports a compaction that no skill load followed', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
    '{"type":"attachment","attachment":{"type":"invoked_skills","skills":[{"name":"testing","path":"projectSettings:testing","content":"# Testing"}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: true,
  });
});

test('it ignores a slash command in a subagent transcript', () => {
  const transcript = String.raw`{"type":"user","isSidechain":true,"message":{"role":"user","content":"<command-name>/testing</command-name>\n<command-message>testing</command-message>"}}`;

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: false,
  });
});

test('it collects a Skill tool call in a subagent transcript', () => {
  const transcript = [
    '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","isSidechain":true,"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['testing'],
    readPaths: [],
    compacted: false,
  });
});

test('it ignores a skill name that only appears in text', () => {
  const transcript = [
    String.raw`{"type":"assistant","message":{"content":[{"type":"text","text":"\"name\":\"Skill\",\"input\":{\"skill\":\"testing\"}"}]}}`,
    '{"type":"user","message":{"role":"user","content":"please load <command-name>/testing</command-name>"}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: false,
  });
});

test('it skips a line that is not JSON', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"assistant","message":',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: ['testing'],
    readPaths: [],
    compacted: false,
  });
});

test('it yields nothing for a transcript with no skill loads', () => {
  expect(collectSessionLoads('{"type":"user","message":{"content":"hi"}}')).toStrictEqual({
    skills: [],
    readPaths: [],
    compacted: false,
  });
});

test('it collects the path of each Read call that succeeded since the last compaction', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"/repo/.claude/skills/ticket-review/references/old.md"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"# Old"}]}}',
    '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Read","input":{"file_path":"/repo/.claude/skills/ticket-review/references/reasons.md"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"# Reasons"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_3","name":"Read","input":{"file_path":"/repo/.claude/skills/ticket-review/references/missing.md"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_3","is_error":true,"content":"File does not exist."}]}}',
  ].join('\n');

  expect(collectSessionLoads(transcript)).toStrictEqual({
    skills: [],
    readPaths: ['/repo/.claude/skills/ticket-review/references/reasons.md'],
    compacted: true,
  });
});
