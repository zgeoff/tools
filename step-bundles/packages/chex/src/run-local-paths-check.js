// @bun
// packages/chex/src/run-local-paths-check.ts
import { hostname } from "os";

// packages/chex/src/format-commit-lines.ts
function formatCommitLines(commits) {
  return commits.map((commit) => `${commit}
`).join("");
}

// packages/chex/src/parse-added-lines.ts
function parseAddedLines(patch) {
  const hunkHeader = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;
  const added = [];
  let hash = "";
  let path = null;
  let line = 0;
  let inHeader = false;
  for (const text of patch.split(`
`)) {
    if (text.startsWith("\x00")) {
      hash = text.slice(1);
      path = null;
      inHeader = false;
    } else if (text.startsWith("diff --git ")) {
      path = null;
      inHeader = true;
    } else if (inHeader && text.startsWith("+++ ")) {
      path = parseNewPath(text.slice("+++ ".length));
    } else if (hunkHeader.test(text)) {
      line = Number(hunkHeader.exec(text)?.groups?.["start"]);
      inHeader = false;
    } else if (!inHeader && path !== null && text.startsWith("+")) {
      added.push({ hash, path, line, text: text.slice(1) });
      line += 1;
    } else if (!inHeader && path !== null && text.startsWith(" ")) {
      line += 1;
    }
  }
  return added;
}
function parseNewPath(name) {
  const bare = name.replace(/\t$/u, "");
  if (bare === "/dev/null") {
    return null;
  }
  const unquoted = bare.startsWith('"') && bare.endsWith('"') ? parseQuotedName(bare.slice(1, -1)) : bare;
  return unquoted.replace(/^b\//u, "");
}
var ESCAPED_BYTES = new Map([
  ["a", 7],
  ["b", 8],
  ["t", 9],
  ["n", 10],
  ["v", 11],
  ["f", 12],
  ["r", 13],
  ['"', 34],
  ["\\", 92]
]);
function parseQuotedName(quoted) {
  const bytes = [];
  const encoder = new TextEncoder;
  for (let index = 0;index < quoted.length; index += 1) {
    const character = String.fromCodePoint(quoted.codePointAt(index) ?? 0);
    if (character !== "\\") {
      bytes.push(...encoder.encode(character));
      index += character.length - 1;
      continue;
    }
    const next = quoted.charAt(index + 1);
    const octal = /^[0-7]{3}/u.exec(quoted.slice(index + 1))?.[0];
    if (octal === undefined) {
      bytes.push(ESCAPED_BYTES.get(next) ?? next.codePointAt(0) ?? 92);
      index += 1;
    } else {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// packages/chex/src/pick-merge-blobs-command.ts
function pickMergeBlobsCommand(readings) {
  if (readings.promisor === undefined) {
    return {
      reading: "promisor",
      argv: ["git", "config", "--type=bool", "--get", "remote.origin.promisor"],
      exitCodes: "any"
    };
  }
  if (readings.promisor.trim() !== "true") {
    return null;
  }
  if (readings.merges === undefined) {
    return {
      reading: "merges",
      argv: ["git", "rev-list", "--merges", "--parents", "--no-walk=unsorted", "--stdin"],
      stdin: formatCommitLines(readings.commits),
      exitCodes: [0]
    };
  }
  const merges = splitLines(readings.merges).map((line) => line.split(" "));
  const pending = merges[readings.bases.length];
  if (pending !== undefined) {
    return {
      reading: "bases",
      argv: ["git", "merge-base", "--all", ...pending.slice(1)],
      exitCodes: [0, 1]
    };
  }
  const pairs = merges.flatMap((mergeAndParents, index) => splitLines(readings.bases[index] ?? "").flatMap((base) => mergeAndParents.map((commit) => `${base} ${commit}
`)));
  if (pairs.length === 0) {
    return null;
  }
  if (readings.listing === undefined) {
    const pairCommits = new Set(pairs.flatMap((pair) => pair.trim().split(" ")));
    return {
      reading: "listing",
      argv: ["git", "rev-list", "--objects", "--missing=print", "--no-walk", "--stdin"],
      stdin: formatCommitLines([...pairCommits]),
      exitCodes: [0]
    };
  }
  if (readings.diff === undefined) {
    return {
      reading: "diff",
      argv: ["git", "diff-tree", "-r", "--no-abbrev", "--stdin"],
      stdin: pairs.join(""),
      exitCodes: [0]
    };
  }
  const missing = new Set(splitLines(readings.listing).filter((line) => line.startsWith("?")).map((line) => line.slice(1)));
  const blobs = collectBlobIDs(readings.diff).filter((blob) => missing.has(blob));
  if (blobs.length === 0 || readings.fetch !== undefined) {
    return null;
  }
  return {
    reading: "fetch",
    argv: [
      "git",
      "-c",
      "fetch.negotiationAlgorithm=noop",
      "fetch",
      "--quiet",
      "--no-tags",
      "--no-write-fetch-head",
      "--filter=blob:none",
      "--stdin",
      "origin"
    ],
    stdin: blobs.map((blob) => `${blob}
`).join(""),
    exitCodes: [0]
  };
}
function splitLines(text) {
  return text.split(`
`).filter((line) => line !== "");
}
var blobModes = new Set(["100644", "100755", "120000"]);
function collectBlobIDs(rawDiff) {
  const blobs = new Set;
  for (const line of rawDiff.split(`
`)) {
    if (!line.startsWith(":")) {
      continue;
    }
    const [oldMode, newMode, oldBlob, newBlob] = line.slice(1).split(" ");
    for (const [mode, blob] of [
      [oldMode, oldBlob],
      [newMode, newBlob]
    ]) {
      if (mode !== undefined && blob !== undefined && blobModes.has(mode)) {
        blobs.add(blob);
      }
    }
  }
  return [...blobs];
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

// packages/chex/src/run-local-paths-check.ts
function runLocalPathsCheck(options) {
  const home = findHomePrefix(options.env["HOME"]);
  const host = findHostPattern(options.host);
  if (home === null && host === null) {
    return [];
  }
  const commits = readRangeCommits(options, options.ranges);
  if (commits.length === 0) {
    return [];
  }
  runMergeBlobsFetch(options, commits);
  const result = options.runProgram([
    "git",
    "-c",
    "core.quotePath=false",
    "log",
    "-p",
    "-U0",
    "-M",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--diff-merges=remerge",
    "--format=%x00%h",
    "--no-walk=unsorted",
    "--stdin"
  ], { cwd: options.cwd, env: options.env, stdin: formatCommitLines(commits) });
  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }
  return parseAddedLines(result.stdout).flatMap((added) => {
    const findings = [];
    if (home !== null && added.text.includes(home)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the home directory ${home}; remove it before you push`
      });
    }
    if (host !== null && host.pattern.test(added.text)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the host name ${host.name}; remove it before you push`
      });
    }
    return findings;
  });
}
function findHomePrefix(home) {
  const trimmed = home?.replace(/\/+$/u, "") ?? "";
  return trimmed === "" ? null : `${trimmed}/`;
}
function findHostPattern(name) {
  if (name === "" || name === "localhost") {
    return null;
  }
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return { name, pattern: new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "u") };
}
function runMergeBlobsFetch(options, commits) {
  let readings = { commits, bases: [] };
  for (let command = pickMergeBlobsCommand(readings);command !== null; command = pickMergeBlobsCommand(readings)) {
    const result = options.runProgram(command.argv, {
      cwd: options.cwd,
      env: options.env,
      ...command.stdin === undefined ? {} : { stdin: command.stdin }
    });
    if (command.exitCodes !== "any" && !command.exitCodes.includes(result.exitCode)) {
      throw new Error(`${command.argv.join(" ")} failed: ${result.stderr.trim()}`);
    }
    readings = command.reading === "bases" ? { ...readings, bases: [...readings.bases, result.stdout] } : { ...readings, [command.reading]: result.stdout };
  }
}
async function runLocalPathsCommand(args) {
  try {
    const ranges = readPushedRanges({
      cwd: process.cwd(),
      env: process.env,
      pushedRefs: await readPushedRefsInput(args, () => Bun.stdin.text()),
      runProgram
    });
    const findings = runLocalPathsCheck({
      cwd: process.cwd(),
      ranges,
      env: process.env,
      host: hostname(),
      runProgram
    });
    for (const finding of findings) {
      process.stdout.write(`${finding.path}:${finding.line}: ${finding.message}
`);
    }
    return findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`local-paths: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
if (import.meta.main) {
  process.exitCode = await runLocalPathsCommand(process.argv.slice(2));
}
export {
  runLocalPathsCheck,
  runLocalPathsCommand
};
