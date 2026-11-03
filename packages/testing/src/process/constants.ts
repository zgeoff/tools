export const pollIntervalMs = 50;

// A process outside the group, such as one the program started in a group of its own, can hold the
// output pipes open, so a stop waits only this long for the rest of the output.
export const drainGraceMs = 200;

// How long a stop waits for the group to empty before it sends SIGKILL.
export const groupDeadlineMs = 5000;
export const defaultWaitMs = 10_000;
