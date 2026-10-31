// @bun
// packages/chex/src/run-commits-check.ts
import { dirname, join } from "path";

// packages/chex/src/format-commit-lines.ts
function formatCommitLines(commits) {
  return commits.map((commit) => `${commit}
`).join("");
}

// packages/chex/src/parse-pushed-refs.ts
var zeroSha = /^0+$/u;
function parsePushedRefs(text) {
  return text.split(`
`).filter((line) => line.trim() !== "").flatMap((line) => {
    const [, localSha, , remoteSha] = line.trim().split(" ");
    if (localSha === undefined || remoteSha === undefined) {
      throw new Error(`cannot read the pushed ref line: ${line}`);
    }
    if (zeroSha.test(localSha)) {
      return [];
    }
    return [{ localSha, remoteSha: zeroSha.test(remoteSha) ? null : remoteSha }];
  });
}

// packages/chex/src/read-branch-base.ts
function readBranchBase(options) {
  const defaultBranch = readDefaultBranch(options);
  const base = runGit(options, ["merge-base", "HEAD", defaultBranch]);
  if (base.exitCode !== 0) {
    throw new Error(`cannot find the base of this branch: no merge base between HEAD and ${defaultBranch} (is the remote fetched?)`);
  }
  return base.stdout.trim();
}
function readDefaultBranch(options) {
  const head = runGit(options, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  return head.exitCode === 0 ? head.stdout.trim() : "origin/main";
}
function runGit(options, args) {
  return options.runProgram(["git", ...args], { cwd: options.cwd, env: options.env });
}

// packages/chex/src/read-pushed-ranges.ts
function readPushedRanges(options) {
  if (options.pushedRefs === null) {
    const base = readBranchBase(options);
    return [[`${base}..HEAD`]];
  }
  const refs = parsePushedRefs(options.pushedRefs);
  if (refs.length === 0) {
    return [];
  }
  const defaultBranch = readDefaultBranch(options);
  if (!probeCommitPresent(options, defaultBranch)) {
    throw new Error(`cannot find origin's default branch: ${defaultBranch} is not a commit (is the remote fetched?)`);
  }
  return refs.map((ref) => ref.remoteSha !== null && probeCommitPresent(options, ref.remoteSha) ? [ref.localSha, `^${defaultBranch}`, `^${ref.remoteSha}`] : [ref.localSha, `^${defaultBranch}`]);
}
function probeCommitPresent(options, revision) {
  const result = options.runProgram(["git", "cat-file", "-e", `${revision}^{commit}`], {
    cwd: options.cwd,
    env: options.env
  });
  return result.exitCode === 0;
}

// packages/chex/src/read-pushed-refs-input.ts
import { parseArgs } from "util";
function readPushedRefsInput(args, readStdin) {
  const parsed = parseArgs({
    args: [...args],
    options: { "pushed-refs": { type: "boolean" } },
    strict: true
  });
  return parsed.values["pushed-refs"] === true ? readStdin() : Promise.resolve(null);
}

// packages/chex/src/read-range-commits.ts
function readRangeCommits(options, ranges) {
  const commits = ranges.flatMap((range) => {
    const argv = ["git", "rev-list", ...range];
    const result = options.runProgram(argv, { cwd: options.cwd, env: options.env });
    if (result.exitCode !== 0) {
      throw new Error(`${argv.join(" ")} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.split(`
`).filter((line) => line !== "");
  });
  return [...new Set(commits)];
}

// packages/chex/src/run-program.ts
function runProgram(argv, options) {
  const result = Bun.spawnSync([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: options.stdin === undefined ? "ignore" : Buffer.from(options.stdin),
    stdout: "pipe",
    stderr: "pipe"
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

// packages/chex/src/run-commits-check.ts
function runCommitsCheck(options) {
  return readBranchCommits(options).flatMap((commit) => {
    const result = options.runProgram([options.commitlint, "--config", options.config, "--color=false"], { cwd: options.cwd, env: options.env, stdin: commit.message });
    return parseCommitlintOutput(commit.hash, result);
  });
}
function readBranchCommits(options) {
  const commits = readRangeCommits(options, options.ranges);
  if (commits.length === 0) {
    return [];
  }
  const result = options.runProgram(["git", "log", "--no-merges", "-z", "--format=%h%n%B", "--no-walk=unsorted", "--stdin"], { cwd: options.cwd, env: options.env, stdin: formatCommitLines(commits) });
  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\x00").filter((entry) => entry !== "").map((entry) => {
    const newline = entry.indexOf(`
`);
    return { hash: entry.slice(0, newline), message: entry.slice(newline + 1) };
  });
}
function parseCommitlintOutput(hash, result) {
  const problemLine = /^\u2716\s+(?<message>.+ \[[\w-]+\])$/u;
  if (result.exitCode > 1) {
    throw new Error(`commitlint failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  const problems = result.stdout.split(`
`).flatMap((line) => {
    const message = problemLine.exec(line)?.groups?.["message"];
    return message === undefined ? [] : [`commit ${hash}: ${message}`];
  });
  if (result.exitCode === 1 && problems.length === 0) {
    throw new Error(`commitlint failed: ${result.stderr.trim()}`);
  }
  return problems;
}
async function runCommitsCommand(args) {
  const cwd = process.cwd();
  const commitlint = Bun.which("commitlint", {
    PATH: `${join(cwd, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`
  });
  if (commitlint === null) {
    writeSkipNotice("the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it");
    return 0;
  }
  if (!await probeConfigInstalled(cwd)) {
    writeSkipNotice("the repo does not install @zgeoff/commitlint-config; add it as a devDependency to run it");
    return 0;
  }
  try {
    const config = Bun.resolveSync("@zgeoff/commitlint-config", cwd);
    const ranges = readPushedRanges({
      cwd,
      env: process.env,
      pushedRefs: await readPushedRefsInput(args, () => Bun.stdin.text()),
      runProgram
    });
    const problems = runCommitsCheck({
      cwd,
      ranges,
      env: process.env,
      commitlint,
      config,
      runProgram
    });
    for (const problem of problems) {
      process.stdout.write(`${problem}
`);
    }
    return problems.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`commits: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
async function probeConfigInstalled(cwd) {
  const found = await Promise.all(collectAncestorFolders(cwd).map((folder) => Bun.file(join(folder, "node_modules/@zgeoff/commitlint-config/package.json")).exists()));
  return found.includes(true);
}
function collectAncestorFolders(folder) {
  const parent = dirname(folder);
  return parent === folder ? [folder] : [folder, ...collectAncestorFolders(parent)];
}
function writeSkipNotice(reason) {
  const prefix = process.env["GITHUB_ACTIONS"] === "true" ? "::notice::" : "";
  process.stdout.write(`${prefix}commits: skipped, because ${reason}
`);
}
if (import.meta.main) {
  process.exitCode = await runCommitsCommand(process.argv.slice(2));
}
export {
  runCommitsCheck,
  runCommitsCommand
};
