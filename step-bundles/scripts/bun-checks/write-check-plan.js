// @bun
// scripts/bun-checks/write-check-plan.ts
import { join } from "path";

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

// scripts/bun-checks/plan-check-scripts.ts
function planCheckScripts(request) {
  const defined = new Set(request.defined);
  const listed = request.scripts.split(/\s+/u).filter((name) => name !== "");
  const list = listed.length === 0 ? buildStandardList(defined) : listed;
  const missing = list.filter((name) => !defined.has(name));
  if (missing.length > 0) {
    return { kind: "missing", missing };
  }
  const lanes = list.filter((name) => isLaneScript(name)).map((name) => name.slice("test:".length));
  const tests = list.filter((name) => isTestScript(name) && !isLaneScript(name));
  const staticChecks = list.filter((name) => !isTestScript(name));
  const parts = {
    all: [...staticChecks, ...tests, ...lanes.map((lane) => `test:${lane}`)],
    static: staticChecks,
    test: tests,
    lane: [`test:${request.lane}`]
  };
  return {
    kind: "planned",
    scripts: parts[request.part],
    static: staticChecks,
    test: tests,
    lanes
  };
}
var laneNames = ["e2e", "browser", "docker", "host"];
function buildStandardList(defined) {
  const optional = (name) => defined.has(name) ? [name] : [];
  return [
    "audit",
    "deadcode",
    "format:check",
    "lint",
    "typecheck",
    "test",
    ...laneNames.flatMap((lane) => optional(`test:${lane}`))
  ];
}
function isLaneScript(name) {
  return laneNames.some((lane) => name === `test:${lane}`);
}
function isTestScript(name) {
  return name === "test" || name.startsWith("test:");
}

// scripts/bun-checks/write-check-plan.ts
var parts = ["all", "static", "test", "lane"];
async function writeCheckPlan(step) {
  const part = parts.find((candidate) => candidate === step.part);
  if (part === undefined || step.outputPath === "") {
    return [`the plan step needs PART (one of ${parts.join(", ")}) and GITHUB_OUTPUT.`];
  }
  const packageText = await step.fileSystem.readText(join(step.cwd, "package.json"));
  const packageJSON = JSON.parse(packageText);
  const plan = planCheckScripts({
    scripts: step.scripts,
    defined: readScriptNames(packageJSON),
    part,
    lane: step.lane
  });
  return writePlanOutcome(plan, step);
}
function readScriptNames(value) {
  if (typeof value !== "object" || value === null || !("scripts" in value)) {
    return [];
  }
  const scripts = value.scripts;
  return typeof scripts === "object" && scripts !== null ? Object.keys(scripts) : [];
}
var planOutcomeWriters = {
  missing: (plan) => Promise.resolve([
    `package.json defines no script named: ${plan.missing.join(" ")}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`
  ]),
  planned: async (plan, step) => {
    await writeStepOutputs(step.fileSystem, step.outputPath, {
      scripts: ` ${plan.scripts.join(" ")} `,
      static: ` ${plan.static.join(" ")} `,
      test: ` ${plan.test.join(" ")} `,
      lanes: JSON.stringify(plan.lanes)
    });
    return [];
  }
};
function writePlanOutcome(plan, step) {
  const writeOutcome = planOutcomeWriters[plan.kind];
  return writeOutcome(plan, step);
}
if (import.meta.main) {
  const errors = await writeCheckPlan({
    cwd: process.cwd(),
    outputPath: process.env["GITHUB_OUTPUT"] ?? "",
    part: process.env["PART"] ?? "",
    scripts: process.env["SCRIPTS"] ?? "",
    lane: process.env["LANE"] ?? "",
    fileSystem: nodeFileSystem
  });
  for (const error of errors) {
    process.stdout.write(`::error::${error}
`);
  }
  process.exitCode = errors.length === 0 ? 0 : 1;
}
export {
  writeCheckPlan
};
