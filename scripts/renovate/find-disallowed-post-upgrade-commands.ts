import { isRecord } from '../../packages/std/src/is-record.ts';

// Renovate refuses a post-upgrade command that no allowedCommands pattern matches, and marks the
// branch's artifacts as failed, so every bump that runs the command waits on a person.
export function findDisallowedPostUpgradeCommands(
  presetText: string,
  workflowText: string,
): string | undefined {
  const preset = parseJSON(presetText);

  if (preset === undefined) {
    return 'default.json is not valid JSON';
  }

  const commands = [...new Set(collectPostUpgradeCommands(preset))];

  if (commands.length === 0) {
    return undefined;
  }

  const patterns = parseAllowedCommands(workflowText);

  if (patterns.kind === 'invalid') {
    return `.github/workflows/renovate.yml: ${patterns.message}`;
  }

  const disallowed = commands.filter(
    (command) => !patterns.expressions.some((expression) => expression.test(command)),
  );

  if (disallowed.length > 0) {
    return `default.json: no RENOVATE_ALLOWED_COMMANDS pattern in .github/workflows/renovate.yml allows ${disallowed.map((command) => `'${command}'`).join(', ')}`;
  }

  return undefined;
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

function collectPostUpgradeCommands(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectPostUpgradeCommands(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const tasks = value['postUpgradeTasks'];
  const commands = isRecord(tasks) ? tasks['commands'] : undefined;

  const own = Array.isArray(commands)
    ? commands.filter((command: unknown): command is string => typeof command === 'string')
    : [];

  return [
    ...own,
    ...Object.entries(value)
      .filter(([key]) => key !== 'postUpgradeTasks')
      .flatMap(([, member]) => collectPostUpgradeCommands(member)),
  ];
}

type AllowedCommandsResult =
  | { readonly kind: 'parsed'; readonly expressions: readonly RegExp[] }
  | { readonly kind: 'invalid'; readonly message: string };

function parseAllowedCommands(workflowText: string): AllowedCommandsResult {
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const steps = findMember(findMember(findMember(workflow, 'jobs'), 'renovate'), 'steps');

  const values = (Array.isArray(steps) ? steps : []).flatMap((step: unknown) => {
    const value = findMember(findMember(step, 'env'), 'RENOVATE_ALLOWED_COMMANDS');

    return typeof value === 'string' ? [value] : [];
  });

  const [value] = values;

  if (value === undefined || values.length > 1) {
    return {
      kind: 'invalid',
      message: `the renovate job sets RENOVATE_ALLOWED_COMMANDS ${values.length} times; the check reads exactly one`,
    };
  }

  const patterns = parseJSON(value);

  if (
    !Array.isArray(patterns) ||
    !patterns.every((pattern: unknown): pattern is string => typeof pattern === 'string')
  ) {
    return {
      kind: 'invalid',
      message: 'RENOVATE_ALLOWED_COMMANDS is not a JSON array of strings',
    };
  }

  const expressions: RegExp[] = [];

  for (const pattern of patterns) {
    try {
      expressions.push(new RegExp(pattern, 'u'));
    } catch {
      return {
        kind: 'invalid',
        message: `RENOVATE_ALLOWED_COMMANDS holds '${pattern}', which is not a valid regular expression`,
      };
    }
  }

  return { kind: 'parsed', expressions };
}

function findMember(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const members: [string, unknown][] = Object.entries(value);

  return members.find(([name]) => name === key)?.[1];
}
