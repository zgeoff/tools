// @bun
// packages/std/src/is-record.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// scripts/ci/run-checked-command.ts
class CommandError extends Error {
  result;
  constructor(argv, result) {
    super(`${argv.join(" ")} exited with ${result.exitCode}: ${result.stderr.trim()}`);
    this.name = "CommandError";
    this.result = result;
  }
}
async function runCheckedCommand(runCommandWith, argv, options) {
  const result = await runCommandWith(argv, options);
  if (result.exitCode !== 0) {
    throw new CommandError(argv, result);
  }
  return result;
}

// scripts/ci/run-command.ts
async function runCommand(argv, options) {
  const child = Bun.spawn([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: options.stdin === undefined ? "ignore" : Buffer.from(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ]);
  return { exitCode, stdout, stderr };
}

// scripts/repo-sync/build-hand-pushed-sync-plan.ts
function buildHandPushedSyncPlan(push) {
  if (push.pullRequests.length === 0) {
    return {
      turnOff: [],
      messages: [`${push.branch} has no open pull request; nothing to hold.
`]
    };
  }
  const authored = push.pullRequests.filter((pullRequest) => pullRequest.author === push.pusher);
  const pushed = push.pullRequests.filter((pullRequest) => pullRequest.author !== push.pusher);
  const armed = pushed.filter((pullRequest) => pullRequest.isAutoMergeOn);
  const unarmed = pushed.filter((pullRequest) => !pullRequest.isAutoMergeOn);
  return {
    turnOff: armed.map((pullRequest) => pullRequest.number),
    messages: [
      ...authored.map((pullRequest) => `${push.pusher} opened pull request #${pullRequest.number}; nothing to hold.
`),
      ...armed.map((pullRequest) => `::warning::${push.pusher} pushed to ${push.branch}, so auto-merge of pull request #${pullRequest.number} is off and it waits for review.
`),
      ...unarmed.map((pullRequest) => `${push.pusher} pushed to ${push.branch}, and pull request #${pullRequest.number} has auto-merge off.
`)
    ]
  };
}

// scripts/repo-sync/hold-hand-pushed-sync.ts
async function holdHandPushedSync(options) {
  const repo = options.env["REPO"] ?? "";
  const branch = options.env["BRANCH"] ?? "";
  const pusher = options.env["PUSHER"] ?? "";
  const owner = repo.slice(0, repo.indexOf("/"));
  const commandOptions = { cwd: options.cwd, env: options.env };
  const listed = await runCheckedCommand(options.runCommand, [
    "gh",
    "api",
    "-X",
    "GET",
    `repos/${repo}/pulls`,
    "-f",
    "state=open",
    "-f",
    `head=${owner}:${branch}`
  ], commandOptions);
  const pullsValue = JSON.parse(listed.stdout);
  const pullRequests = parseSyncPullRequests(pullsValue);
  const plan = buildHandPushedSyncPlan({ branch, pusher, pullRequests });
  for (const number of plan.turnOff) {
    await runCheckedCommand(options.runCommand, ["gh", "pr", "merge", String(number), "--disable-auto", "--repo", repo], commandOptions);
  }
  options.writeOutput(plan.messages.join(""));
  return 0;
}
function parseSyncPullRequests(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("gh api returned no list of pull requests");
  }
  return value.map((pull) => parseSyncPullRequest(pull));
}
function parseSyncPullRequest(pull) {
  const user = isRecord(pull) ? pull["user"] : undefined;
  if (!isRecord(pull) || typeof pull["number"] !== "number" || !isRecord(user) || typeof user["login"] !== "string") {
    throw new TypeError("gh api returned a pull request with no number or author");
  }
  return {
    number: pull["number"],
    author: user["login"],
    isAutoMergeOn: pull["auto_merge"] !== null && pull["auto_merge"] !== undefined
  };
}
if (import.meta.main) {
  process.exitCode = await holdHandPushedSync({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  holdHandPushedSync
};
