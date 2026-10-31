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

// scripts/ci/write-step-outputs.ts
async function writeStepOutputs(fileSystem, outputPath, outputs) {
  const lines = Object.entries(outputs).map(([name, value]) => {
    if (value.includes(`
`)) {
      throw new Error(`the step output ${name} holds a newline`);
    }
    return `${name}=${value}
`;
  });
  await fileSystem.appendText(outputPath, lines.join(""));
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

// scripts/audit-fix/plan-audit-fix-commit.ts
function planAuditFixCommit(facts) {
  const stops = { deletesBranch: false, pushedOutput: null, commitMessage: null };
  if (!facts.hasStagedChange) {
    return {
      ...stops,
      logLines: [`bun audit passes with nothing to change; nothing to fix.
`],
      exitCode: 0,
      deletesBranch: true,
      pushedOutput: "false",
      readsOpenPullRequest: false
    };
  }
  if (facts.titleText.trim() === "") {
    return {
      ...stops,
      logLines: [`::error::audit-fix changed files but wrote no pull-request title
`],
      exitCode: 1,
      readsOpenPullRequest: false
    };
  }
  return {
    logLines: [],
    exitCode: 0,
    deletesBranch: false,
    pushedOutput: null,
    commitMessage: facts.titleText.replace(/\n+$/u, ""),
    readsOpenPullRequest: facts.reviewText.trim() === "true"
  };
}

// scripts/audit-fix/plan-audit-fix-push.ts
function planAuditFixPush(facts) {
  return {
    disablesAutoMerge: facts.openNumber !== null,
    pushes: !facts.isSameTree,
    logLines: facts.isSameTree ? [`The open fix already holds this change.
`] : []
  };
}

// scripts/audit-fix/read-open-pull-request.ts
async function readOpenPullRequest(query) {
  const listed = await runCheckedCommand(query.runCommand, ["gh", "pr", "list", "--head", query.branch, "--state", "open", "--json", "number"], { cwd: query.cwd, env: query.env });
  const parsed = JSON.parse(listed.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : undefined;
  return typeof first === "object" && first !== null && "number" in first && typeof first.number === "number" ? first.number : null;
}

// scripts/audit-fix/commit-audit-fix.ts
async function commitAuditFix(options) {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const commandOptions = { cwd: options.cwd, env: options.env };
  const git = (args) => runCheckedCommand(options.runCommand, ["git", ...args], commandOptions);
  const tryGit = (args) => options.runCommand(["git", ...args], commandOptions);
  await git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  await git(["config", "user.name", "github-actions[bot]"]);
  await git(["checkout", "-B", paths.branch]);
  await git(["add", "-A"]);
  const staged = await tryGit(["diff", "--cached", "--quiet"]);
  const titleText = await readTextFile(options.fileSystem, paths.title);
  const reviewText = await readTextFile(options.fileSystem, paths.review);
  const plan = planAuditFixCommit({
    hasStagedChange: staged.exitCode !== 0,
    titleText,
    reviewText
  });
  writeLogLines(options, plan.logLines);
  if (plan.deletesBranch) {
    await tryGit(["push", "origin", "--delete", paths.branch]);
  }
  if (plan.pushedOutput !== null) {
    await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: plan.pushedOutput });
  }
  if (plan.commitMessage === null) {
    return plan.exitCode;
  }
  await git(["commit", "-m", plan.commitMessage]);
  const openNumber = plan.readsOpenPullRequest ? await readOpenPullRequest({
    ...commandOptions,
    branch: paths.branch,
    runCommand: options.runCommand
  }) : null;
  const isSameTree = await probeSameTree(options, paths.branch);
  const push = planAuditFixPush({ openNumber, isSameTree });
  if (push.disablesAutoMerge) {
    await options.runCommand(["gh", "pr", "merge", paths.branch, "--disable-auto"], commandOptions);
  }
  if (push.pushes) {
    await git(["push", "--force", "origin", paths.branch]);
  }
  writeLogLines(options, push.logLines);
  await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: "true" });
  return 0;
}
async function readTextFile(fileSystem, path) {
  const exists = await fileSystem.probePath(path);
  return exists ? fileSystem.readText(path) : "";
}
function writeLogLines(options, lines) {
  for (const line of lines) {
    options.writeOutput(line);
  }
}
async function probeSameTree(options, branch) {
  const git = (args) => options.runCommand(["git", ...args], { cwd: options.cwd, env: options.env });
  const fetched = await git(["fetch", "--quiet", "origin", branch]);
  if (fetched.exitCode !== 0) {
    return false;
  }
  const head = await git(["rev-parse", "HEAD^{tree}"]);
  const remote = await git(["rev-parse", "FETCH_HEAD^{tree}"]);
  return head.stdout === remote.stdout;
}
if (import.meta.main) {
  process.exitCode = await commitAuditFix({
    cwd: process.cwd(),
    env: process.env,
    runnerTemp: process.env["RUNNER_TEMP"] ?? "",
    base: process.env["BASE"] ?? "",
    defaultBranch: process.env["DEFAULT_BRANCH"] ?? "",
    outputPath: process.env["GITHUB_OUTPUT"] ?? "",
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  commitAuditFix
};
