// @bun
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

// scripts/bun-checks/build-path-batches.ts
function buildPathBatches(paths, limitBytes) {
  const batches = [];
  let batch = [];
  let batchBytes = 0;
  for (const path of paths) {
    const pathBytes = Buffer.byteLength(path) + 1;
    if (batch.length > 0 && batchBytes + pathBytes > limitBytes) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(path);
    batchBytes += pathBytes;
  }
  return batch.length > 0 ? [...batches, batch] : batches;
}

// scripts/bun-checks/run-shell-check.ts
async function runShellCheck(run) {
  const options = { cwd: run.cwd, env: run.env };
  const listed = await runCheckedCommand(run.runCommand, ["git", "ls-files", "-z", "--", "*.sh"], options);
  const scripts = listed.stdout.split("\x00").filter((path) => path !== "");
  if (scripts.length === 0) {
    run.writeOutput(`shell: the repo tracks no shell script
`);
    return 0;
  }
  const batches = buildPathBatches(scripts, run.batchBytes);
  const exitCodes = [];
  for (const batch of batches) {
    const shellcheck = await run.runLoggedCommand([
      "shellcheck",
      "--external-sources",
      "--source-path=SCRIPTDIR",
      `--source-path=${run.cwd}`,
      "--",
      ...batch
    ], options);
    exitCodes.push(shellcheck.exitCode);
  }
  for (const batch of batches) {
    const shfmt = await run.runLoggedCommand(["shfmt", "-d", "--", ...batch], options);
    exitCodes.push(shfmt.exitCode);
  }
  return exitCodes.every((exitCode) => exitCode === 0) ? 0 : 1;
}
var xargsBatchBytes = 128 * 1024;
if (import.meta.main) {
  process.exitCode = await runShellCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    batchBytes: xargsBatchBytes
  });
}
export {
  runShellCheck
};
