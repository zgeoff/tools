// @bun
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

// packages/std/src/is-record.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// scripts/repo-sync/parse-sync-pull-requests.ts
function parseSyncPullRequests(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const pullRequests = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item["number"] !== "number" || typeof item["url"] !== "string" || typeof item["createdAt"] !== "string" || !Array.isArray(item["statusCheckRollup"])) {
      return null;
    }
    pullRequests.push({
      number: item["number"],
      url: item["url"],
      createdAt: item["createdAt"],
      red: item["statusCheckRollup"].some((check) => isRedCheck(check))
    });
  }
  return pullRequests;
}
var redConclusions = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "FAILURE",
  "STARTUP_FAILURE",
  "TIMED_OUT"
]);
var redStates = new Set(["ERROR", "FAILURE"]);
function isRedCheck(check) {
  if (!isRecord(check)) {
    return false;
  }
  const conclusion = check["conclusion"];
  const state = check["state"];
  return typeof conclusion === "string" && redConclusions.has(conclusion) || typeof state === "string" && redStates.has(state);
}

// scripts/repo-sync/pick-sync-alarm.ts
var dayMs = 24 * 60 * 60 * 1000;
function pickSyncAlarm(facts) {
  const stuck = facts.pullRequests.find((pullRequest) => pullRequest.red && facts.now.getTime() - Date.parse(pullRequest.createdAt) > dayMs);
  if (stuck === undefined) {
    return { kind: "quiet" };
  }
  const title = `repo-sync: pull request #${stuck.number} is red for more than a day`;
  if (facts.issueTitles.includes(title)) {
    return { kind: "quiet" };
  }
  return {
    kind: "raise",
    title,
    body: [
      `The repo-sync pull request ${stuck.url}, opened at ${stuck.createdAt}, has a failing check, so it does not merge and this repo stops taking the shared files from zgeoff/tools.`,
      "",
      "Read the failing check and fix its cause: in this repo when the synced files break a check here, or in zgeoff/tools when the shared files are wrong. A fix in zgeoff/tools reaches this pull request in the next sync run. Close this issue once the pull request merges."
    ].join(`
`)
  };
}

// scripts/repo-sync/write-sync-alarm.ts
async function writeSyncAlarm(options) {
  const listed = await runAlarmCommand(options, [
    "gh",
    "pr",
    "list",
    "--head",
    options.branch,
    "--state",
    "open",
    "--json",
    "number,url,createdAt,statusCheckRollup"
  ]);
  const listedValue = JSON.parse(listed.stdout);
  const pullRequests = parseSyncPullRequests(listedValue);
  if (pullRequests === null) {
    options.writeOutput(`::error::gh pr list printed no list of pull requests
`);
    return 1;
  }
  const issues = await runAlarmCommand(options, [
    "gh",
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "1000",
    "--json",
    "title",
    "--jq",
    ".[].title"
  ]);
  const alarm = pickSyncAlarm({
    pullRequests,
    issueTitles: issues.stdout.split(`
`),
    now: options.now
  });
  if (alarm.kind === "quiet") {
    options.writeOutput(`No new sync pull request is red for more than a day.
`);
    return 0;
  }
  const created = await runAlarmCommand(options, [
    "gh",
    "issue",
    "create",
    "--title",
    alarm.title,
    "--body",
    alarm.body
  ]);
  options.writeOutput(`::warning::Opened ${created.stdout.trim()}: ${alarm.title}
`);
  return 0;
}
function runAlarmCommand(options, argv) {
  return runCheckedCommand(options.runCommand, argv, { cwd: options.cwd, env: options.env });
}
if (import.meta.main) {
  process.exitCode = await writeSyncAlarm({
    cwd: process.cwd(),
    env: process.env,
    branch: process.env["BRANCH"] ?? "",
    now: new Date,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  writeSyncAlarm
};
