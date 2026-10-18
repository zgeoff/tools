export interface SkillGate {
  readonly match: string;
  readonly skills: readonly string[];
}

export interface SkillGateRules {
  readonly ignore: readonly string[];
  readonly gates: readonly SkillGate[];
}

export type SkillGateRulesResult =
  | { readonly ok: true; readonly rules: SkillGateRules }
  | { readonly ok: false; readonly error: string };

export interface UnknownSkill {
  readonly match: string;
  readonly skill: string;
}

export interface LoadedSkills {
  readonly skills: readonly string[];
  readonly compacted: boolean;
}

export interface SkillGateInput {
  readonly rules: SkillGateRules;
  readonly relativePath: string;
  readonly loadedSkills: readonly string[];
  readonly availableSkills: readonly string[];
}

export interface SkillGatePlan {
  readonly missing: readonly string[];
  readonly unknown: readonly UnknownSkill[];
}

export interface ShellWord {
  readonly text: string;
  readonly literal: boolean;
}

export interface ShellRedirect {
  readonly operator: string;
  readonly target: ShellWord;
}

export interface ShellCommand {
  readonly words: readonly ShellWord[];
  readonly redirects: readonly ShellRedirect[];
  readonly stdin: string | null;
}

// A path a Bash command writes, relative to the command's working directory unless absolute. With
// a `fileName`, as for `cp a.ts dest`, the write lands at `path/fileName` when `path` is a
// directory, and at `path` otherwise.
export interface WrittenPath {
  readonly path: string;
  readonly fileName?: string;
}

export interface SkillGateOutputContext {
  readonly compacted?: boolean;
  readonly rulesError?: string;
}

export interface SkillGateHookOutput {
  readonly systemMessage?: string;
  readonly hookSpecificOutput: {
    readonly hookEventName: 'PreToolUse';
    readonly permissionDecision?: 'deny';
    readonly permissionDecisionReason?: string;
    readonly additionalContext?: string;
  };
}
