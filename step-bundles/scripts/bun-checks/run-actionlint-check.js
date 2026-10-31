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

// scripts/bun-checks/run-actionlint-check.ts
var queueIgnoreExpires = "20270122";
var queueIgnore = 'unexpected key "queue" for "concurrency" section';
async function runActionlintCheck(run) {
  const isIgnoring = run.today < queueIgnoreExpires;
  if (!isIgnoring) {
    run.writeOutput(`::warning::workflows: the ignore of the concurrency queue key expired on ${queueIgnoreExpires}; move the actionlint pin to a release with rhysd/actionlint#654
`);
  }
  const argv = isIgnoring ? ["actionlint", "-ignore", queueIgnore] : ["actionlint"];
  const result = await run.runLoggedCommand(argv, { cwd: run.cwd, env: run.env });
  return result.exitCode;
}
if (import.meta.main) {
  process.exitCode = await runActionlintCheck({
    cwd: process.cwd(),
    env: process.env,
    today: new Date().toISOString().slice(0, 10).replaceAll("-", ""),
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runActionlintCheck
};
