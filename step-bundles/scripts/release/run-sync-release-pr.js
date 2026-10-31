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

// scripts/release/run-sync-release-pr.ts
async function runSyncReleasePR(options) {
  const commandOptions = { cwd: options.cwd, env: options.env };
  const run = (argv) => runCheckedCommand(options.runLoggedCommand, argv, commandOptions);
  await run(["bash", "-c", options.syncCommand]);
  const diff = await options.runCommand(["git", "diff", "--quiet"], commandOptions);
  if (diff.exitCode === 0) {
    options.writeOutput(`The sync command changed nothing; the release PR stays as it is.
`);
    return;
  }
  if (diff.exitCode !== 1) {
    throw new Error(`git diff failed: ${diff.stderr.trim()}`);
  }
  await run(["git", "config", "user.name", "github-actions[bot]"]);
  await run([
    "git",
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  ]);
  await run(["git", "commit", "-am", "chore: sync lockfile and format release files"]);
  await run(["git", "push"]);
}
if (import.meta.main) {
  await runSyncReleasePR({
    cwd: process.cwd(),
    env: process.env,
    syncCommand: process.env["SYNC_COMMAND"] ?? "",
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runSyncReleasePR
};
