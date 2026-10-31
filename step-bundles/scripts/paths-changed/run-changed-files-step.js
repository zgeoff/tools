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

// scripts/paths-changed/run-path-match.ts
var matchScript = [
  "shopt -s extglob",
  'while IFS= read -r -d "" path; do',
  '  for pattern in "$@"; do',
  String.raw`    if [[ $path == $pattern ]]; then printf "%s\0%s\0" "$path" "$pattern"; fi`,
  "  done",
  "done"
].join(`
`);
async function runPathMatch(query) {
  if (query.paths.length === 0 || query.patterns.length === 0) {
    return [];
  }
  const result = await runCheckedCommand(query.runCommand, ["bash", "-c", matchScript, "bash", ...query.patterns], { cwd: query.cwd, env: query.env, stdin: query.paths.map((path) => `${path}\x00`).join("") });
  const fields = result.stdout.split("\x00").slice(0, -1);
  return Array.from({ length: fields.length / 2 }, (_, index) => ({
    path: fields[index * 2] ?? "",
    pattern: fields[index * 2 + 1] ?? ""
  }));
}

// scripts/paths-changed/match-changed-files.ts
async function matchChangedFiles(match) {
  if (match.event !== "pull_request") {
    return { changed: true, matches: [] };
  }
  const files = await readMergeChangedFiles(match);
  const pathMatches = await runPathMatch({
    paths: files,
    patterns: match.patterns.split(`
`).filter((pattern) => pattern !== ""),
    cwd: match.checkout,
    env: match.env,
    runCommand: match.runCommand
  });
  const matches = pathMatches.map((pathMatch) => `${pathMatch.path} matches ${pathMatch.pattern}`);
  return { changed: matches.length > 0, matches };
}
async function readMergeChangedFiles(match) {
  const result = await runCheckedCommand(match.runCommand, ["git", "diff", "-z", "--name-only", "--no-renames", "HEAD^1", "HEAD"], { cwd: match.checkout, env: match.env });
  return result.stdout.split("\x00").filter((file) => file !== "");
}

// scripts/paths-changed/run-changed-files-step.ts
async function runChangedFilesStep(step) {
  const outputPath = step.env["GITHUB_OUTPUT"] ?? "";
  const checkout = step.env["GITHUB_WORKSPACE"] ?? "";
  if (outputPath === "" || checkout === "") {
    step.writeOutput(`::error::the match step needs GITHUB_OUTPUT and GITHUB_WORKSPACE
`);
    return 1;
  }
  const answer = await matchChangedFiles({
    checkout,
    env: step.env,
    event: step.env["EVENT"] ?? "",
    patterns: step.env["PATTERNS"] ?? "",
    runCommand: step.runCommand
  });
  for (const line of answer.matches) {
    step.writeOutput(`${line}
`);
  }
  step.writeOutput(`changed=${answer.changed}
`);
  await writeStepOutputs(step.fileSystem, outputPath, { changed: String(answer.changed) });
  return 0;
}
if (import.meta.main) {
  process.exitCode = await runChangedFilesStep({
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runChangedFilesStep
};
