// @bun
// scripts/ci/node-file-system.ts
import { appendFile, mkdir as mkdir2, readFile, readdir, stat } from "fs/promises";

// packages/chex/src/write-text-file.ts
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
async function writeTextFile(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

// packages/rig/src/browser/remove-path.ts
import { rm } from "fs/promises";
async function removePath(path) {
  await rm(path, { recursive: true, force: true });
}

// scripts/ci/node-file-system.ts
var nodeFileSystem = {
  readText: (path) => readFile(path, "utf8"),
  readBytes: async (path) => {
    const buffer = await readFile(path);
    return new Uint8Array(buffer);
  },
  readDirectory: (path) => readdir(path),
  readFilePaths: async (folder) => {
    try {
      await stat(folder);
    } catch {
      return [];
    }
    const paths = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: folder }));
    return paths.toSorted();
  },
  writeText: writeTextFile,
  appendText: (path, text) => appendFile(path, text),
  createDirectory: async (path) => {
    await mkdir2(path, { recursive: true });
  },
  removePath,
  probePath: async (path) => {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
};

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

// scripts/audit-fix/build-audit-fix-paths.ts
import { join } from "path";
function buildAuditFixPaths(runnerTemp, base, defaultBranch) {
  return {
    branch: base === defaultBranch ? "audit-fix" : `audit-fix-${base.replaceAll("/", "-")}`,
    title: join(runnerTemp, "title.txt"),
    body: join(runnerTemp, "body.md"),
    review: join(runnerTemp, "needs-review.txt"),
    pendingIgnores: join(runnerTemp, "pending-ignores.json"),
    pullRequestBody: join(runnerTemp, "pr-body.md")
  };
}

// scripts/audit-fix/plan-audit-fix-pull-request.ts
function planAuditFixPullRequest(facts) {
  const labels = ["dependencies", "security", ...facts.needsReview ? ["audit-ignore"] : []];
  const labelCommands = labels.map((label) => ({
    args: ["label", "create", label],
    mustSucceed: false
  }));
  const textArgs = ["--title", facts.title, "--body-file", facts.bodyFile];
  const writeCommands = facts.openNumber === null ? [
    {
      args: [
        "pr",
        "create",
        "--base",
        facts.base,
        "--head",
        facts.branch,
        ...textArgs,
        "--label",
        labels.join(",")
      ],
      mustSucceed: true
    }
  ] : buildEditCommands(facts, String(facts.openNumber), textArgs, labels);
  return {
    commands: [...labelCommands, ...writeCommands],
    waitsForReview: facts.needsReview,
    turnsAutoMergeOn: !facts.needsReview && facts.isAutomerge
  };
}
function buildEditCommands(facts, number, textArgs, labels) {
  const edit = {
    args: ["pr", "edit", number, ...textArgs, "--add-label", labels.join(",")],
    mustSucceed: true
  };
  const removeIgnoreLabel = {
    args: ["pr", "edit", number, "--remove-label", "audit-ignore"],
    mustSucceed: false
  };
  return facts.needsReview ? [edit] : [edit, removeIgnoreLabel];
}

// scripts/audit-fix/read-open-pull-request.ts
async function readOpenPullRequest(query) {
  const listed = await runCheckedCommand(query.runCommand, ["gh", "pr", "list", "--head", query.branch, "--state", "open", "--json", "number"], { cwd: query.cwd, env: query.env });
  const parsed = JSON.parse(listed.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : undefined;
  return typeof first === "object" && first !== null && "number" in first && typeof first.number === "number" ? first.number : null;
}

// scripts/audit-fix/open-audit-fix-pull-request.ts
async function openAuditFixPullRequest(options) {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const commandOptions = { cwd: options.cwd, env: options.env };
  const gh = (args) => options.runCommand(["gh", ...args], commandOptions);
  const checkedGH = (args) => runCheckedCommand(options.runCommand, ["gh", ...args], commandOptions);
  const titleText = await options.fileSystem.readText(paths.title);
  const body = await options.fileSystem.readText(paths.body);
  const reviewText = await options.fileSystem.readText(paths.review);
  await options.fileSystem.writeText(paths.pullRequestBody, `${body}
[Workflow run](${options.runURL})
`);
  const openNumber = await readOpenPullRequest({
    ...commandOptions,
    branch: paths.branch,
    runCommand: options.runCommand
  });
  const plan = planAuditFixPullRequest({
    needsReview: reviewText.trim() === "true",
    openNumber,
    isAutomerge: options.isAutomerge,
    base: options.base,
    branch: paths.branch,
    title: titleText.replace(/\n+$/u, ""),
    bodyFile: paths.pullRequestBody
  });
  for (const command of plan.commands) {
    await (command.mustSucceed ? checkedGH(command.args) : gh(command.args));
  }
  if (plan.waitsForReview) {
    options.writeOutput(`The pull request adds or renews an ignore, so it waits for a person's review.
`);
  }
  if (!plan.turnsAutoMergeOn) {
    return;
  }
  const merge = await gh(["pr", "merge", paths.branch, "--auto", "--squash"]);
  if (merge.exitCode !== 0) {
    options.writeOutput(`::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.
`);
  }
}
if (import.meta.main) {
  const env = process.env;
  await openAuditFixPullRequest({
    cwd: process.cwd(),
    env,
    runnerTemp: env["RUNNER_TEMP"] ?? "",
    base: env["BASE"] ?? "",
    defaultBranch: env["DEFAULT_BRANCH"] ?? "",
    isAutomerge: env["AUTOMERGE"] === "true",
    runURL: env["RUN_URL"] ?? "",
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  openAuditFixPullRequest
};
