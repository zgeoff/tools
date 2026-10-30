import { hasErrorCode } from './has-error-code.ts';
import { isZombieState } from './is-zombie-state.ts';
import { readProcessTable } from './read-process-table.ts';

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
// keeps forever, so the group counts as live only while a member that is no zombie runs. A failed
// listing leaves the group's state unknown, so it counts as live.
function probeLiveMember(groupID: number): boolean {
  const table = readProcessTable();

  return (
    table === null ||
    table.some((entry) => entry.groupID === groupID && !isZombieState(entry.state))
  );
}
