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

// scripts/repo-sync/write-sync-ref.ts
async function writeSyncRef(options) {
  if (options.ref !== "") {
    await writeStepOutputs(options.fileSystem, options.outputPath, { ref: options.ref });
    return 0;
  }
  const runs = await options.runCommand([
    "gh",
    "api",
    "-X",
    "GET",
    "repos/zgeoff/tools/actions/workflows/main.yml/runs",
    "-f",
    "branch=main",
    "-f",
    "event=push",
    "-f",
    "status=success",
    "-f",
    "per_page=1",
    "--jq",
    ".workflow_runs[0].head_sha // empty"
  ], { cwd: options.cwd, env: options.env });
  const newest = runs.stdout.trim();
  const isFound = runs.exitCode === 0 && /^[0-9a-f]{40}$/u.test(newest);
  if (!isFound) {
    options.writeOutput(`::warning::Cannot read the newest green commit of zgeoff/tools, so the run syncs the pinned ${options.workflowCommit}: ${runs.stderr.trim()}
`);
  }
  const ref = isFound ? newest : options.workflowCommit;
  await writeStepOutputs(options.fileSystem, options.outputPath, { ref });
  return 0;
}
if (import.meta.main) {
  process.exitCode = await writeSyncRef({
    cwd: process.cwd(),
    env: process.env,
    ref: process.env["REF"] ?? "",
    workflowCommit: process.env["WORKFLOW_COMMIT"] ?? "",
    outputPath: process.env["GITHUB_OUTPUT"] ?? "",
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  writeSyncRef
};
