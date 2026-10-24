import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import resolveRepoRoot from './resolve-repo-root.js';

// a report on one file per repo shows once per run, and an editor's
// language server keeps it on that file across edits
const anchorFiles = new Map();

const noCommentRuleOverride = {
  meta: {
    type: 'problem',
    messages: {
      override:
        '{{config}} sets {{rule}}. Delete the setting: every repo runs {{rule}} as @zgeoff/oxlint-config ships it.',
    },
    schema: [],
  },
  create(context) {
    const root = resolveRepoRoot(context.filename);

    if (root === null) {
      return {};
    }

    if (!anchorFiles.has(root)) {
      anchorFiles.set(root, context.filename);
    }

    if (anchorFiles.get(root) !== context.filename) {
      return {};
    }

    return {
      Program(node) {
        for (const override of loadOverrides(root)) {
          context.report({ node, messageId: 'override', data: override });
        }
      },
    };
  },
};

export default noCommentRuleOverride;

const configPattern = /^\.oxlintrc(?:\.[\w-]+)?\.jsonc?$/u;

const lockedRules = [
  'no-jsdoc',
  'max-consecutive-line-comments',
  'consistent-type-assertions',
  'no-hidden-cast',
];

// oxlint reads a rule under any plugin prefix, such as
// `@typescript-eslint/consistent-type-assertions`, or under its bare name
const keyPatterns = lockedRules.map(
  (rule) => new RegExp(`"(?<key>(?:[^"/\\s]+/)?${rule})"\\s*:`, 'gu'),
);

function loadOverrides(root) {
  const configs = readdirSync(root).filter((name) => configPattern.test(name));

  return configs.flatMap((name) => {
    const text = buildCommentFreeText(readFileSync(join(root, name), 'utf8'));

    return keyPatterns.flatMap((pattern) => {
      const keys = new Set(Array.from(text.matchAll(pattern), (match) => match.groups.key));

      return [...keys].map((rule) => ({ config: name, rule }));
    });
  });
}

function buildCommentFreeText(text) {
  return text.replaceAll(
    /(?<string>"(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu,
    (...match) => match.at(-1).string ?? '',
  );
}
