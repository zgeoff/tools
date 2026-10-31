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

// scripts/release/parse-text-list.ts
function parseTextList(text) {
  const parsed = parseJSON(text);
  if (!Array.isArray(parsed)) {
    return null;
  }
  const values = parsed.filter((value) => typeof value === "string");
  return values.length === parsed.length ? values : null;
}
function parseJSON(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    return;
  }
}

// scripts/ci/is-text-entry.ts
function isTextEntry(entry) {
  return typeof entry[1] === "string";
}

// scripts/release/parse-text-record.ts
function parseTextRecord(text) {
  const parsed = parseJSON2(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const entries = Object.entries(parsed);
  const textEntries = entries.filter((entry) => isTextEntry(entry));
  return textEntries.length === entries.length ? Object.fromEntries(textEntries) : null;
}
function parseJSON2(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    return;
  }
}

// scripts/release/parse-release-outputs.ts
function parseReleaseOutputs(text) {
  const outputs = parseTextRecord(text);
  if (outputs === null) {
    return { kind: "invalid", message: "the release outputs hold no JSON object of text values" };
  }
  const paths = parseTextList(outputs["paths_released"] ?? "[]");
  if (paths === null) {
    return { kind: "invalid", message: "paths_released holds no JSON array of paths" };
  }
  return { kind: "parsed", outputs, paths };
}

// scripts/release/pick-release-outputs.ts
function pickReleaseOutputs(releaseOutputsText) {
  const parsed = parseReleaseOutputs(releaseOutputsText);
  if (parsed.kind === "invalid") {
    return parsed;
  }
  const outputs = parsed.outputs;
  const [firstPath] = parsed.paths;
  const pickFirst = (key) => outputs[key] ?? (firstPath === undefined ? undefined : outputs[`${firstPath}--${key}`]) ?? "";
  return {
    kind: "picked",
    outputs: {
      releases_created: outputs["releases_created"] ?? "false",
      tag: pickFirst("tag_name"),
      version: pickFirst("version"),
      "release-outputs": JSON.stringify(outputs)
    }
  };
}

// scripts/release/run-release-outputs-step.ts
async function runReleaseOutputsStep(step) {
  const outputPath = step.env["GITHUB_OUTPUT"] ?? "";
  const result = pickReleaseOutputs(step.env["RELEASE_OUTPUTS"] ?? "");
  if (outputPath === "") {
    step.writeOutput(`::error::the release outputs step needs GITHUB_OUTPUT
`);
    return 1;
  }
  if (result.kind === "invalid") {
    step.writeOutput(`::error::RELEASE_OUTPUTS: ${result.message}
`);
    return 1;
  }
  await writeStepOutputs(step.fileSystem, outputPath, result.outputs);
  return 0;
}
if (import.meta.main) {
  process.exitCode = await runReleaseOutputsStep({
    env: process.env,
    fileSystem: nodeFileSystem,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  runReleaseOutputsStep
};
