import { expect, test } from 'bun:test';
import { collectLoadedSkills } from './collect-loaded-skills.ts';

test('it collects every skill a successful Skill tool call loaded', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"next"},{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing","args":"review"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
  ].join('\n');

  expect(collectLoadedSkills(transcript)).toStrictEqual(['testing', 'project-testing']);
});

test('it ignores a Skill tool call that failed', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":true,"content":"The user denied the call"}]}}',
  ].join('\n');

  expect(collectLoadedSkills(transcript)).toBeEmpty();
});

test('it ignores a Skill tool call that has no result yet', () => {
  const transcript =
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}';

  expect(collectLoadedSkills(transcript)).toBeEmpty();
});

test('it collects a skill the user loaded with a slash command', () => {
  const transcript = String.raw`{"type":"user","message":{"role":"user","content":"<command-name>/docs-writing</command-name>\n<command-message>docs-writing</command-message>"}}`;

  expect(collectLoadedSkills(transcript)).toStrictEqual(['docs-writing']);
});

test('it collects a slash command whose message tag comes first', () => {
  const transcript = String.raw`{"type":"user","message":{"role":"user","content":"<command-message>testing is running…</command-message>\n<command-name>/testing</command-name>"}}`;

  expect(collectLoadedSkills(transcript)).toStrictEqual(['testing']);
});

test('it ignores a load that a compaction boundary summarized away', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"code-style"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: code-style"}]}}',
  ].join('\n');

  expect(collectLoadedSkills(transcript)).toStrictEqual(['code-style']);
});

test('it ignores a skill name that only appears in text', () => {
  const transcript = [
    String.raw`{"type":"assistant","message":{"content":[{"type":"text","text":"\"name\":\"Skill\",\"input\":{\"skill\":\"testing\"}"}]}}`,
    '{"type":"user","message":{"role":"user","content":"please load <command-name>/testing</command-name>"}}',
  ].join('\n');

  expect(collectLoadedSkills(transcript)).toBeEmpty();
});

test('it skips a line that is not JSON', () => {
  const transcript = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
    '{"type":"assistant","message":',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    '',
  ].join('\n');

  expect(collectLoadedSkills(transcript)).toStrictEqual(['testing']);
});

test('it yields nothing for a transcript with no skill loads', () => {
  expect(collectLoadedSkills('{"type":"user","message":{"content":"hi"}}')).toBeEmpty();
});
