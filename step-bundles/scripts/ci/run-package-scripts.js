// @bun
// scripts/ci/make-bun-script-runner.ts
function makeBunScriptRunner(cwd, env) {
  return (name) => Bun.spawn(["bun", "run", name], { cwd, env: { ...env }, stdout: "inherit", stderr: "inherit" }).exited;
}

// scripts/ci/run-package-scripts.ts
async function runPackageScripts(run) {
  const names = run.scripts.split(/\s+/u).filter((name) => name !== "");
  for (const name of names) {
    run.writeOutput(`::group::bun run ${name}
`);
    const exitCode = await run.runScript(name);
    run.writeOutput(`::endgroup::
`);
    if (exitCode !== 0) {
      return exitCode;
    }
  }
  return 0;
}
if (import.meta.main) {
  process.exitCode = await runPackageScripts({
    scripts: process.env["SCRIPTS"] ?? "",
    runScript: makeBunScriptRunner(process.cwd(), process.env),
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runPackageScripts
};
