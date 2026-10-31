// @bun
// scripts/bun-checks/run-docs-check.ts
import { basename, join as join2 } from "path";

// scripts/ci/make-logged-command-runner.ts
function makeLoggedCommandRunner(output) {
  return async (argv, options) => {
    const child = Bun.spawn([...argv], {
      cwd: options.cwd,
      env: { ...options.env },
      stdin: options.stdin === undefined ? "ignore" : Buffer.from(options.stdin),
      stdout: "pipe",
      stderr: "pipe",
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      readTeedStream(child.stdout, output.stdout),
      readTeedStream(child.stderr, output.stderr),
      child.exited
    ]);
    const result = { exitCode, stdout, stderr };
    return result;
  };
}
async function readTeedStream(stream, sink) {
  const decoder = new TextDecoder;
  let text = "";
  for await (const chunk of stream) {
    sink.write(chunk);
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

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

// scripts/bun-checks/build-docs-commands.ts
import { join } from "path";
var docsScriptsFolder = ".claude/skills/docs-writing/scripts";
var visionScript = join(docsScriptsFolder, "check-vision.sh");
var skillScript = ".claude/skills/skill-writing/scripts/check-skill.sh";
var readmePathspecs = [
  ":(glob)**/README.md",
  ":(exclude,glob).claude/**",
  ":(exclude,glob).agents/**"
];
var prosePathspecs = [
  ":(glob)docs/**/*.md",
  ":(glob)**/results.md",
  ":(glob).agents/skills/**/*.md",
  ":(glob).claude/skills/**/*.md",
  ":(glob)skills/**/*.md",
  ":(glob)sync/skills/**/*.md"
];
function buildDocsCommands(input) {
  return [
    {
      script: join(docsScriptsFolder, "check-prose.sh"),
      args: [...input.readmes, ...prosePathspecs]
    },
    { script: join(docsScriptsFolder, "check-length.sh"), args: [] },
    { script: join(docsScriptsFolder, "check-links.sh"), args: [] },
    ...input.vision ? [{ script: visionScript, args: [] }] : [],
    ...input.skill ? [{ script: skillScript, args: [] }] : []
  ];
}

// scripts/bun-checks/run-docs-check.ts
async function runDocsCheck(run) {
  const hasScripts = await run.fileSystem.probePath(join2(run.cwd, docsScriptsFolder, "check-length.sh"));
  if (!hasScripts) {
    run.writeOutput(`::notice::docs: skipped, because the repo has no ${docsScriptsFolder}/check-length.sh; take the skill-docs-writing entry of repo-sync to run it
`);
    return 0;
  }
  const vision = await run.fileSystem.probePath(join2(run.cwd, visionScript));
  const skill = await run.fileSystem.probePath(join2(run.cwd, skillScript));
  const readmes = await readReadmes(run);
  const commands = buildDocsCommands({ vision, skill, readmes });
  let exitCode = 0;
  for (const command of commands) {
    const result = await run.runLoggedCommand(["bash", command.script, ...command.args], {
      cwd: run.cwd,
      env: run.env
    });
    if (result.exitCode !== 0) {
      run.writeOutput(`::error::docs: ${basename(command.script)} failed; its output above holds each failing file and its fault
`);
      exitCode = 1;
    }
  }
  return exitCode;
}
async function readReadmes(run) {
  const result = await run.runCommand([
    "git",
    "-c",
    "core.quotePath=false",
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...readmePathspecs
  ], { cwd: run.cwd, env: run.env });
  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  }
  return [...new Set(result.stdout.split("\x00").filter((path) => path !== ""))].toSorted();
}
if (import.meta.main) {
  process.exitCode = await runDocsCheck({
    cwd: process.cwd(),
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runDocsCheck
};
