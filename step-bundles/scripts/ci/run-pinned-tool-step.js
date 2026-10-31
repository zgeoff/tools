// @bun
// scripts/ci/install-pinned-tool.ts
import { join } from "path";

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

// scripts/ci/install-pinned-tool.ts
async function installPinnedTool(install) {
  const download = join(install.runnerTemp, `${install.name}.download`);
  const folder = join(install.runnerTemp, `${install.name}-bin`);
  const options = { cwd: install.runnerTemp, env: install.env };
  await runCheckedCommand(install.runCommand, ["curl", "-fsSL", "--retry", "3", "--retry-all-errors", "-o", download, install.pin.url], options);
  const bytes = await install.fileSystem.readBytes(download);
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (sha256 !== install.pin.sha256) {
    await install.fileSystem.removePath(download);
    throw new Error(`${install.name}: the download's sha256 is ${sha256}, not the pinned ${install.pin.sha256}`);
  }
  await install.fileSystem.createDirectory(folder);
  await runCheckedCommand(install.runCommand, buildUnpackCommand(install, download, folder), options);
  await install.fileSystem.appendText(install.githubPath, `${folder}
`);
}
var unpackCommands = {
  binary: (name, download, folder) => ["install", "-m", "0755", download, join(folder, name)],
  "tar.gz": (name, download, folder) => ["tar", "-xzf", download, "-C", folder, name]
};
function buildUnpackCommand(install, download, folder) {
  return unpackCommands[install.pin.packaging](install.name, download, folder);
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

// scripts/ci/parse-tool-args.ts
import { parseArgs } from "util";
function parseToolArgs(args, names) {
  const usage = `usage: run-pinned-tool-step.ts <${names.join("|")}>`;
  try {
    const positionals = parseArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
      strict: true
    }).positionals;
    const [name] = positionals;
    return positionals.length === 1 && name !== undefined && names.includes(name) ? { kind: "parsed", name } : { kind: "refused", message: usage };
  } catch (error) {
    return {
      kind: "refused",
      message: `${error instanceof Error ? error.message : String(error)}
${usage}`
    };
  }
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

// scripts/ci/should-install-tool.ts
function shouldInstallTool(part, requested) {
  return requested === "true" || part === "static" || part === "all";
}

// scripts/ci/tool-pins.ts
var shfmtVersion = "v3.13.1";
var actionlintVersion = "1.7.12";
var toolPins = {
  shfmt: {
    url: `https://github.com/mvdan/sh/releases/download/${shfmtVersion}/shfmt_${shfmtVersion}_linux_amd64`,
    sha256: "fb096c5d1ac6beabbdbaa2874d025badb03ee07929f0c9ff67563ce8c75398b1",
    packaging: "binary",
    neededBy: "shell check"
  },
  actionlint: {
    url: `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
    sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    packaging: "tar.gz",
    neededBy: "workflows check"
  }
};

// scripts/ci/run-pinned-tool-step.ts
function runPinnedToolStep(step) {
  return runToolArgs(parseToolArgs(step.args, Object.keys(step.pins)), step);
}
var toolArgsRunners = {
  refused: (args) => Promise.resolve({ exitCode: 2, output: `${args.message}
` }),
  parsed: (args, step) => runToolInstall(args.name, step)
};
function runToolArgs(args, step) {
  const runArgs = toolArgsRunners[args.kind];
  return runArgs(args, step);
}
async function runToolInstall(name, step) {
  const pin = step.pins[name];
  if (pin === undefined) {
    throw new Error(`${name}: the argument parse accepted a tool with no pin`);
  }
  if (!shouldInstallTool(step.env["PART"] ?? "", step.env["SETUP_TOOL"] ?? "")) {
    return {
      exitCode: 0,
      output: `${name}: not needed, because this job runs no ${pin.neededBy}
`
    };
  }
  const runnerTemp = step.env["RUNNER_TEMP"] ?? "";
  const githubPath = step.env["GITHUB_PATH"] ?? "";
  if (runnerTemp === "" || githubPath === "") {
    return {
      exitCode: 1,
      output: `::error::${name}: the install needs RUNNER_TEMP and GITHUB_PATH
`
    };
  }
  await installPinnedTool({
    name,
    pin,
    runnerTemp,
    githubPath,
    env: step.env,
    fileSystem: step.fileSystem,
    runCommand: step.runCommand
  });
  return { exitCode: 0, output: "" };
}
if (import.meta.main) {
  const result = await runPinnedToolStep({
    args: process.argv.slice(2),
    env: process.env,
    pins: toolPins,
    fileSystem: nodeFileSystem,
    runCommand
  });
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}
export {
  runPinnedToolStep
};
