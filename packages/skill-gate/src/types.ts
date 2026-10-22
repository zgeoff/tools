import type { z } from 'zod';
import type { bashSnapshotSchema } from './bash-snapshot-schema.ts';

export interface SkillGate {
  readonly match: string;
  readonly skills: readonly string[];
}

export interface SkillGateRules {
  readonly ignore: readonly string[];
  readonly gates: readonly SkillGate[];
}

// A gate on a tool call: `references` are files under .claude/skills/ that the session reads.
export interface ToolGate {
  readonly tool: string;
  readonly skills: readonly string[];
  readonly references: readonly string[];
}

// `unknownKeys` names each key the parser skips, such as `commands` or `tools[0].timeout`.
export type SkillGateRulesResult =
  | {
      readonly ok: true;
      readonly rules: SkillGateRules;
      readonly tools: readonly ToolGate[];
      readonly unknownKeys: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

export interface UnknownSkill {
  readonly match: string;
  readonly skill: string;
}

// `readPaths` holds each file path a successful Read call named.
export interface SessionLoads {
  readonly skills: readonly string[];
  readonly readPaths: readonly string[];
  readonly compacted: boolean;
}

export interface SkillGateInput {
  readonly rules: SkillGateRules;
  readonly relativePath: string;
  readonly loadedSkills: readonly string[];
  readonly availableSkills: readonly string[];
}

// A path a Bash command writes inside the project: absolute, and relative to the project root.
export interface ProjectPath {
  readonly path: string;
  readonly relativePath: string;
}

export interface BashSkillGateInput {
  readonly rules: SkillGateRules;
  readonly paths: readonly ProjectPath[];
  readonly loadedSkills: readonly string[];
  readonly availableSkills: readonly string[];
}

export interface BashSkillGatePlan {
  readonly gatedPaths: readonly string[];
  readonly missing: readonly string[];
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

// `enters` counts the subshells that open just before the command, and `leaves` the ones that
// close just after it.
export interface ShellCommand {
  readonly words: readonly ShellWord[];
  readonly redirects: readonly ShellRedirect[];
  readonly stdin: string | null;
  readonly enters: number;
  readonly leaves: number;
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
  readonly unknownKeys?: readonly string[];
}

export interface ToolGateInput {
  readonly tools: readonly ToolGate[];
  readonly toolName: string;
  readonly skillsDir: string;
  readonly loads: SessionLoads;
  readonly availableSkills: readonly string[];
  readonly availableReferences: readonly string[];
}

export interface UnknownToolRequirement {
  readonly tool: string;
  readonly kind: 'skill' | 'reference';
  readonly name: string;
}

export interface ToolGatePlan {
  readonly missingSkills: readonly string[];
  readonly missingReferences: readonly string[];
  readonly unknown: readonly UnknownToolRequirement[];
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

// A content hash per project path, or null for a path that holds no file.
export type FileHashes = Readonly<Record<string, string | null>>;

export type PostToolEvent = 'PostToolUse' | 'PostToolUseFailure';

export type HookEvent = 'PreToolUse' | PostToolEvent;

export type BashChangeHookOutput =
  | { readonly decision: 'block'; readonly reason: string }
  | {
      readonly hookSpecificOutput: {
        readonly hookEventName: 'PostToolUseFailure';
        readonly additionalContext: string;
      };
    };

export interface WorkTree {
  readonly head: string | null;
  readonly dirtyPaths: readonly string[];
}

// The gated files dirty before a Bash command and the commit HEAD named then, or git's error.
export type BashSnapshot = Readonly<z.infer<typeof bashSnapshotSchema>>;

export interface BashCheckFailureHookOutput {
  readonly systemMessage: string;
  readonly hookSpecificOutput: {
    readonly hookEventName: PostToolEvent;
    readonly additionalContext: string;
  };
}

export interface CommitRange {
  readonly from: string | null;
  readonly to: string;
}

export interface BashCandidates {
  readonly hashedPaths: readonly string[];
  readonly cleanBefore: readonly string[];
}

// Reads a file's content, or null for a path that holds no file.
export type ReadFileContent = (filePath: string) => Promise<Uint8Array | null>;

export type RecordedSnapshot = Extract<BashSnapshot, { kind: 'recorded' }>;

export type BashComparison =
  | { readonly kind: 'no-work-tree' }
  | { readonly kind: 'git-failed'; readonly error: string }
  | { readonly kind: 'compared'; readonly changedPaths: readonly string[] };

export type BashResultStep =
  | { readonly kind: 'skip' }
  | { readonly kind: 'report'; readonly error: string }
  | { readonly kind: 'gate'; readonly changedPaths: readonly string[] };

export type RecordStep =
  | Exclude<BashResultStep, { kind: 'gate' }>
  | { readonly kind: 'compare'; readonly recorded: RecordedSnapshot };
