import { ProcessGroupStopError } from './process-group-stop-error.ts';

export class ProcessGroupStillRunningError extends ProcessGroupStopError {
  constructor(groupID: number) {
    super(groupID, `the process group ${groupID} still runs after SIGKILL`);

    this.name = 'ProcessGroupStillRunningError';
  }
}
