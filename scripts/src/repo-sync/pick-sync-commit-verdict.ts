// How one pin of a holder relates to the commit a run was sent.
export type PinOrder =
  | { readonly pin: string; readonly order: 'newer' }
  | { readonly pin: string; readonly order: 'not-newer' }
  | { readonly pin: string; readonly order: 'unknown'; readonly reason: string };

export type PinsReading =
  | { readonly kind: 'read'; readonly pins: readonly PinOrder[] }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface SyncCommitFacts {
  readonly commit: string;
  readonly isOnMain: boolean;

  // The branch the caller checked out, and the pins its workflows hold on the remote.
  readonly base: string;
  readonly basePins: PinsReading;

  // The open sync pull request and the pins its branch holds, or null when none is open.
  readonly pullRequest: {
    readonly number: string;
    readonly branch: string;
    readonly pins: PinsReading;
  } | null;
}

export type SyncCommitVerdict =
  | { readonly kind: 'current' }
  | { readonly kind: 'refused'; readonly message: string }
  | {
      readonly kind: 'superseded';

      // The base branch or the open pull request that already pins the newer commit.
      readonly holder: string;
      readonly pin: string;
    };

// Anyone who can push to the caller can send a dispatch, and GitHub serves a fork's commit through
// this repository, so only a commit on main may run its manifest's builds. A pin the run cannot
// read stops it, because the run cannot tell an older dispatch from a current one.
export function pickSyncCommitVerdict(facts: Readonly<SyncCommitFacts>): SyncCommitVerdict {
  if (!facts.isOnMain) {
    return { kind: 'refused', message: `${facts.commit} is not a commit on main of zgeoff/tools` };
  }

  const baseVerdict = pickHolderVerdict(facts.commit, {
    holder: facts.base,
    ref: facts.base,
    reading: facts.basePins,
  });

  if (baseVerdict !== null) {
    return baseVerdict;
  }

  if (facts.pullRequest === null) {
    return { kind: 'current' };
  }

  const pullRequestVerdict = pickHolderVerdict(facts.commit, {
    holder: `Pull request #${facts.pullRequest.number}`,
    ref: facts.pullRequest.branch,
    reading: facts.pullRequest.pins,
  });

  return pullRequestVerdict ?? { kind: 'current' };
}

interface PinHolder {
  // The name a superseded run reports, and the ref the run reads the pins from.
  readonly holder: string;
  readonly ref: string;
  readonly reading: PinsReading;
}

function pickHolderVerdict(commit: string, holder: Readonly<PinHolder>): SyncCommitVerdict | null {
  if (holder.reading.kind === 'unreadable') {
    return {
      kind: 'refused',
      message: `Cannot read ${holder.ref} from the remote, so the run cannot tell whether ${commit} is older than its pin; the next run tries again: ${holder.reading.reason}`,
    };
  }

  const newer = holder.reading.pins.find((pin) => pin.order === 'newer');

  if (newer !== undefined) {
    return { kind: 'superseded', holder: holder.holder, pin: newer.pin };
  }

  const unknown = holder.reading.pins.find((pin) => pin.order === 'unknown');

  if (unknown !== undefined) {
    return {
      kind: 'refused',
      message: `Cannot tell whether ${commit} is older than the pin ${unknown.pin} on ${holder.ref}, so the run stops; the next run tries again: ${unknown.reason}`,
    };
  }

  return null;
}
