import { expect, test } from 'bun:test';
import { findDisallowedPostUpgradeCommands } from './find-disallowed-post-upgrade-commands.ts';

test('it passes when an allowed pattern matches every command in a package rule and in vulnerabilityAlerts', () => {
  const preset = JSON.stringify({
    vulnerabilityAlerts: { postUpgradeTasks: { commands: ['bun install --frozen'] } },
    packageRules: [
      { matchPackageNames: ['@acme/widget'], postUpgradeTasks: { commands: ['widget init'] } },
    ],
  });

  const workflow = `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '["^bun install --frozen$", "^(widget|gadget) init$"]'\n`;

  expect(findDisallowedPostUpgradeCommands(preset, workflow)).toBeUndefined();
});

test('it names each command that no allowed pattern matches, once', () => {
  const preset = JSON.stringify({
    vulnerabilityAlerts: { postUpgradeTasks: { commands: ['bun install --frozen'] } },
    packageRules: [
      { postUpgradeTasks: { commands: ['bun install --frozen', 'gadget init'] } },
      { postUpgradeTasks: { commands: ['sprocket init'] } },
    ],
  });

  const workflow = `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '["^bun install --frozen$"]'\n`;

  expect(findDisallowedPostUpgradeCommands(preset, workflow)).toBe(
    "default.json: no RENOVATE_ALLOWED_COMMANDS pattern in .github/workflows/renovate.yml allows 'gadget init', 'sprocket init'",
  );
});

test('it applies each pattern as written, as Renovate does, so only an anchored one refuses a longer command', () => {
  const preset = JSON.stringify({
    packageRules: [{ postUpgradeTasks: { commands: ['widget init --force'] } }],
  });

  expect(
    findDisallowedPostUpgradeCommands(
      preset,
      `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '["widget init"]'\n`,
    ),
  ).toBeUndefined();

  expect(
    findDisallowedPostUpgradeCommands(
      preset,
      `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '["^widget init$"]'\n`,
    ),
  ).toBe(
    "default.json: no RENOVATE_ALLOWED_COMMANDS pattern in .github/workflows/renovate.yml allows 'widget init --force'",
  );
});

test('it passes a preset with no post-upgrade command without reading the workflow', () => {
  const preset = JSON.stringify({ packageRules: [{ automerge: true }] });

  expect(findDisallowedPostUpgradeCommands(preset, 'jobs: {}\n')).toBeUndefined();
});

test('it refuses a preset that is not JSON', () => {
  expect(
    findDisallowedPostUpgradeCommands(
      '{',
      `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '[]'\n`,
    ),
  ).toBe('default.json is not valid JSON');
});

test('it refuses a renovate job that sets no RENOVATE_ALLOWED_COMMANDS', () => {
  const preset = JSON.stringify({ postUpgradeTasks: { commands: ['widget init'] } });

  expect(
    findDisallowedPostUpgradeCommands(
      preset,
      'jobs:\n  renovate:\n    steps:\n      - run: true\n',
    ),
  ).toBe(
    '.github/workflows/renovate.yml: the renovate job sets RENOVATE_ALLOWED_COMMANDS 0 times; the check reads exactly one',
  );
});

test('it refuses a RENOVATE_ALLOWED_COMMANDS that is not a JSON array of strings', () => {
  const preset = JSON.stringify({ postUpgradeTasks: { commands: ['widget init'] } });

  expect(
    findDisallowedPostUpgradeCommands(
      preset,
      `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '{"widget": 1}'\n`,
    ),
  ).toBe(
    '.github/workflows/renovate.yml: RENOVATE_ALLOWED_COMMANDS is not a JSON array of strings',
  );
});

test('it refuses a RENOVATE_ALLOWED_COMMANDS pattern that is not a valid regular expression', () => {
  const preset = JSON.stringify({ postUpgradeTasks: { commands: ['widget init'] } });

  expect(
    findDisallowedPostUpgradeCommands(
      preset,
      `jobs:\n  renovate:\n    steps:\n      - env:\n          RENOVATE_ALLOWED_COMMANDS: '["^(widget init$"]'\n`,
    ),
  ).toBe(
    ".github/workflows/renovate.yml: RENOVATE_ALLOWED_COMMANDS holds '^(widget init$', which is not a valid regular expression",
  );
});
