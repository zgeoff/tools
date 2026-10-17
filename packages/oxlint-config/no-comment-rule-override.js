import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import findRepoRoot from './find-repo-root.js';

// every repo runs the comment rules exactly as this config ships them
const lockedRules = ['zgeoff/no-jsdoc', 'zgeoff/max-consecutive-line-comments'];

const configPattern = /^\.oxlintrc(?:\.[\w-]+)?\.jsonc?$/u;

// a rule key, as opposed to the same text inside a comment or a string value
const keyPatterns = lockedRules.map((rule) => ({
  rule,
  pattern: new RegExp(`"${rule}"\\s*:`, 'u'),
}));

// one report per repo per process, so a repo with an override sees it once
// rather than on every file
const reportedRoots = new Set();

function buildCommentFreeText(text) {
  return text.replaceAll(
    /(?<string>"(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu,
    (...match) => match.at(-1).string ?? '',
  );
}

function loadOverrides(root) {
  const configs = readdirSync(root).filter((name) => configPattern.test(name));

  return configs.flatMap((name) => {
    const text = buildCommentFreeText(readFileSync(join(root, name), 'utf8'));

    return keyPatterns
      .filter((entry) => entry.pattern.test(text))
      .map((entry) => ({ config: name, rule: entry.rule }));
  });
}

const noCommentRuleOverride = {
  meta: {
    type: 'problem',
    messages: {
      override:
        '{{config}} sets {{rule}}. Delete the setting: every repo runs the comment rules as @zgeoff/oxlint-config ships them.',
    },
    schema: [],
  },
  create(context) {
    const root = findRepoRoot(context.filename);

    if (root === null || reportedRoots.has(root)) {
      return {};
    }

    reportedRoots.add(root);

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
