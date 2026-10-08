// Collects the skills a transcript loaded since its last compaction, which summarizes earlier loads
// away. A skill loads through a Skill tool call, or through a slash command the user types.
export function collectLoadedSkills(transcript: string): readonly string[] {
  const entries = transcript.split('\n').map((line) => parseEntry(line));
  const lastBoundary = entries.findLastIndex((entry) => isCompactBoundary(entry));
  const skills = entries.slice(lastBoundary + 1).flatMap((entry) => collectEntrySkills(entry));

  return [...new Set(skills)];
}

function parseEntry(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isCompactBoundary(entry: unknown): boolean {
  return isRecord(entry) && entry['type'] === 'system' && entry['subtype'] === 'compact_boundary';
}

function collectEntrySkills(entry: unknown): readonly string[] {
  if (!isRecord(entry) || !isRecord(entry['message'])) {
    return [];
  }

  const content = entry['message']['content'];

  if (entry['type'] === 'user' && typeof content === 'string') {
    const command = SLASH_COMMAND_PATTERN.exec(content)?.groups?.['skill'];

    return command === undefined ? [] : [command];
  }

  if (entry['type'] !== 'assistant' || !Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block: unknown) => collectSkillCall(block));
}

// A slash command opens the user message with this tag.
const SLASH_COMMAND_PATTERN = /^\s*<command-name>\/(?<skill>[^<\s]+)<\/command-name>/u;

function collectSkillCall(block: unknown): readonly string[] {
  if (!isRecord(block) || block['type'] !== 'tool_use' || block['name'] !== 'Skill') {
    return [];
  }

  const input = block['input'];

  return isRecord(input) && typeof input['skill'] === 'string' ? [input['skill']] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
