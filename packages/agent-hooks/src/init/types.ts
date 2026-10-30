export interface HookEventEntry {
  readonly event: string;
  readonly matcher?: string;
}

export interface HookPlan {
  readonly command: string;
  readonly events: readonly HookEventEntry[];
}

export interface InitFileSystem {
  // Resolves to null when the file is missing.
  readonly readText: (filePath: string) => Promise<string | null>;

  // Creates the parent folders first.
  readonly writeText: (filePath: string, text: string) => Promise<void>;
}
