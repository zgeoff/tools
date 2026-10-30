export interface HookEventEntry {
  readonly event: string;
  readonly matcher?: string;
}

export interface HookPlan {
  readonly command: string;
  readonly events: readonly HookEventEntry[];
}
