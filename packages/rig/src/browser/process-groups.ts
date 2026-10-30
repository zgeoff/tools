import { hasErrorCode } from './has-error-code.ts';

export interface ProcessGroups {
  readonly signalGroup: (groupID: number, signal: NodeJS.Signals) => void;

  readonly probeGroup: (groupID: number) => boolean;
}

export const processGroups: ProcessGroups = {
  signalGroup: (groupID, signal) => {
    try {
      process.kill(-groupID, signal);
    } catch (error) {
      if (!hasErrorCode(error, 'ESRCH')) {
        throw error;
      }
    }
  },

  // A signal of 0 checks the group without signalling it. EPERM means a member runs under another
  // user.
  probeGroup: (groupID) => {
    try {
      process.kill(-groupID, 0);
    } catch (error) {
      return hasErrorCode(error, 'EPERM');
    }

    return probeLiveMember(groupID);
  },
};

// A signal of 0 also reaches a zombie, which a host whose first process never reaps its orphans
// keeps forever, so the group counts as live only while a member that is no zombie runs.
function probeLiveMember(groupID: number): boolean {
  const listing = Bun.spawnSync(['ps', '-A', '-o', 'pgid=,stat=']);

  if (listing.exitCode !== 0) {
    return true;
  }

  return listing.stdout
    .toString()
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .some(
      ([pgid, state]) => Number(pgid) === groupID && state !== undefined && !state.startsWith('Z'),
    );
}
