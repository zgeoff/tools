import type { Harness } from '../harness.ts';

export const INIT_FILES: {
  readonly stub: string;
  readonly rules: string;
  readonly settings: readonly { readonly harness: Harness; readonly file: string }[];
} = {
  stub: '.claude/hooks/start.ts',
  rules: '.claude/skill-gate.json',
  settings: [
    { harness: 'claude-code', file: '.claude/settings.json' },
    { harness: 'codex', file: '.codex/hooks.json' },
  ],
};
