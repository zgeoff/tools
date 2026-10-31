export class ProcessGroupStopError extends Error {
  readonly groupID: number;

  constructor(groupID: number, message: string, options?: ErrorOptions) {
    super(message, options);

    this.name = 'ProcessGroupStopError';
    this.groupID = groupID;
  }
}
