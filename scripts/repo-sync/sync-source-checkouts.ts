// The repos a manifest entry can take its sources from, each with the folder of the caller's
// checkout where the sync job checks it out.
export const syncSourceCheckouts = {
  'zgeoff/tools': '.repo-sync',
  'zgeoff/skills': '.repo-sync-skills',
} as const satisfies Record<string, string>;

export type SyncSourceRepo = keyof typeof syncSourceCheckouts;
