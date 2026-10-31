import type { Harness } from './harness.ts';

export type HookResult =
  | { readonly kind: 'allow'; readonly output?: object }
  | { readonly kind: 'block'; readonly message: string };

export interface RepoContext {
  readonly harness: Harness;
  readonly projectDir: string;
}

export type AgentHookHandler = (payload: unknown, context: RepoContext) => Promise<HookResult>;
