export interface SyncPullRequest {
  readonly number: number;
  readonly author: string;
  readonly isAutoMergeOn: boolean;
}

export interface HandPushedSyncPush {
  readonly branch: string;
  readonly pusher: string;

  // The open pull requests of the branch.
  readonly pullRequests: readonly SyncPullRequest[];
}

export interface HandPushedSyncPlan {
  // The pull requests whose auto-merge the guard turns off.
  readonly turnOff: readonly number[];

  // The log lines, each with its newline.
  readonly messages: readonly string[];
}

export function buildHandPushedSyncPlan(push: HandPushedSyncPush): HandPushedSyncPlan {
  if (push.pullRequests.length === 0) {
    return {
      turnOff: [],
      messages: [`${push.branch} has no open pull request; nothing to hold.\n`],
    };
  }

  const authored = push.pullRequests.filter((pullRequest) => pullRequest.author === push.pusher);
  const pushed = push.pullRequests.filter((pullRequest) => pullRequest.author !== push.pusher);
  const armed = pushed.filter((pullRequest) => pullRequest.isAutoMergeOn);
  const unarmed = pushed.filter((pullRequest) => !pullRequest.isAutoMergeOn);

  return {
    turnOff: armed.map((pullRequest) => pullRequest.number),
    messages: [
      ...authored.map(
        (pullRequest) =>
          `${push.pusher} opened pull request #${pullRequest.number}; nothing to hold.\n`,
      ),
      ...armed.map(
        (pullRequest) =>
          `::warning::${push.pusher} pushed to ${push.branch}, so auto-merge of pull request #${pullRequest.number} is off and it waits for review.\n`,
      ),
      ...unarmed.map(
        (pullRequest) =>
          `${push.pusher} pushed to ${push.branch}, and pull request #${pullRequest.number} has auto-merge off.\n`,
      ),
    ],
  };
}
