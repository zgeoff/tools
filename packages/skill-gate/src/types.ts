import type { z } from 'zod';
import type { bashSnapshotSchema } from './bash-snapshot-schema.ts';
import type { Harness } from './harness.ts';

export interface SkillGate {
  readonly match: string;
  readonly skills: readonly string[];
}

export interface SkillGateRules {
  readonly ignore: readonly string[];
  readonly gates: readonly SkillGate[];
}

export interface ToolGate {
  readonly tool: string;
  readonly skills: readonly string[];
  readonly references: readonly string[];
}

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

export interface ShellCommand {
  readonly words: readonly ShellWord[];
  readonly redirects: readonly ShellRedirect[];
  readonly stdin: string | null;
  readonly enters: number;
  readonly leaves: number;
  readonly guard?: ShellGuard | null;
}

// What decides whether a command runs: the commands before it in an `&&` or `||` chain, and
// whether a `||` sits between.
export interface ShellGuard {
  readonly viaOr: boolean;
  readonly before: readonly (readonly ShellWord[])[];
}

export interface WrittenPath {
  readonly path: string;
  readonly fileName?: string;
}

export interface SkillGateOutputContext {
  readonly harness?: Harness;
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

export interface HarnessWording {
  readonly loadSkill: string;
  readonly readFile: string;
  readonly editTools: string;
}

export interface HookInput {
  readonly kind: 'tool';
  readonly harness: Harness;
  readonly event: HookEvent;
  readonly toolName: string | null;
  readonly cwd: string;
  readonly editPaths: readonly string[];
  readonly command: string | null;
  readonly transcriptPath: string | null;
  readonly sessionID: string | null;
  readonly toolUseID: unknown;
  readonly agentID: unknown;
}

// Codex fires these events with no tool call. UserPromptSubmit carries the prompt.
export interface LifecycleInput {
  readonly kind: 'lifecycle';
  readonly event: 'UserPromptSubmit' | 'PostCompact';
  readonly cwd: string;
  readonly transcriptPath: string | null;
  readonly sessionID: string | null;
  readonly prompt: string | null;
}

export interface SessionState {
  readonly transcriptPath: string | null;
  readonly sessionID: string | null;
}

export interface EditEntry {
  readonly filePath: string;
  readonly plan: SkillGatePlan;
}
