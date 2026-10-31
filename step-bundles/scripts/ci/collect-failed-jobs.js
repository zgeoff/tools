// @bun
// scripts/ci/collect-failed-jobs.ts
var passingResults = new Set(["success", "skipped"]);
function collectFailedJobs(needsText) {
  const needs = JSON.parse(needsText);
  if (typeof needs !== "object" || needs === null) {
    throw new Error("NEEDS holds no object of jobs");
  }
  return Object.entries(needs).flatMap(([job, value]) => {
    const result = typeof value === "object" && value !== null && "result" in value ? value.result : undefined;
    return typeof result === "string" && passingResults.has(result) ? [] : [`${job}: ${String(result)}`];
  });
}
if (import.meta.main) {
  const failed = collectFailedJobs(process.env["NEEDS"] ?? "");
  for (const line of failed) {
    process.stdout.write(`::error::${line}
`);
  }
  if (failed.length === 0) {
    process.stdout.write(`every job passed or skipped by design
`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}
export {
  collectFailedJobs
};
