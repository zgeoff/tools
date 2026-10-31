// @bun
// scripts/repo-sync/write-sync-entries.ts
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

// packages/std/src/is-record.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// scripts/repo-sync/parse-sync-entries.ts
function parseSyncEntries(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries = value.map((entry) => parseSyncEntry(entry));
  return entries.every((entry) => entry !== null) ? entries : null;
}
function parseSyncEntry(entry) {
  if (!isRecord(entry) || typeof entry["name"] !== "string" || typeof entry["description"] !== "string" || !Array.isArray(entry["files"])) {
    return null;
  }
  const build = entry["build"] ?? "";
  const optIn = entry["optIn"] ?? false;
  const scripts = entry["scripts"] ?? {};
  const files = entry["files"].map((file) => parseSyncFile(file));
  if (typeof build !== "string" || typeof optIn !== "boolean" || !isStringRecord(scripts) || !files.every((file) => file !== null)) {
    return null;
  }
  return {
    name: entry["name"],
    description: entry["description"],
    files,
    build,
    optIn,
    scripts
  };
}
function parseSyncFile(file) {
  if (!isRecord(file) || typeof file["source"] !== "string" || typeof file["target"] !== "string") {
    return null;
  }
  const mode = file["mode"];
  const except = file["except"];
  if (mode !== undefined && typeof mode !== "string") {
    return null;
  }
  if (except !== undefined && !isStringList(except)) {
    return null;
  }
  return {
    source: file["source"],
    target: file["target"],
    ...mode === undefined ? {} : { mode },
    ...except === undefined ? {} : { except }
  };
}
function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

// scripts/repo-sync/pick-sync-entries.ts
function pickSyncEntries(selection) {
  const skip = parseEntryNames(selection.skip);
  const include = parseEntryNames(selection.include);
  const optIn = new Set(selection.manifest.filter((entry) => entry.optIn).map((entry) => entry.name));
  const unknown = include.filter((name) => !optIn.has(name));
  if (unknown.length > 0) {
    return {
      kind: "refused",
      message: `include lists no opt-in manifest entry: ${formatLogNames(unknown)}`
    };
  }
  const both = include.filter((name) => skip.includes(name));
  if (both.length > 0) {
    return { kind: "refused", message: `skip and include both list: ${formatLogNames(both)}` };
  }
  const entries = selection.manifest.filter((entry) => !skip.includes(entry.name)).filter((entry) => !entry.optIn || include.includes(entry.name));
  return { kind: "picked", entries };
}
function parseEntryNames(list) {
  return list.split(",").map((name) => name.replaceAll(/\s/gu, "")).filter((name) => name !== "");
}
function formatLogNames(names) {
  return names.join(", ").replaceAll(":", " ");
}

// scripts/repo-sync/write-sync-entries.ts
async function writeSyncEntries(options) {
  const manifestText = await options.fileSystem.readText(join(options.cwd, "sync/manifest.json"));
  const manifestValue = JSON.parse(manifestText);
  const manifest = parseSyncEntries(manifestValue);
  if (manifest === null) {
    options.writeOutput(`::error::sync/manifest.json holds no list of valid entries
`);
    return 1;
  }
  const picked = pickSyncEntries({ manifest, skip: options.skip, include: options.include });
  if (picked.kind === "refused") {
    options.writeOutput(`::error::${picked.message}
`);
    return 1;
  }
  await writeStepOutputs(options.fileSystem, options.outputPath, {
    entries: JSON.stringify(picked.entries)
  });
  return 0;
}
if (import.meta.main) {
  process.exitCode = await writeSyncEntries({
    cwd: process.cwd(),
    skip: process.env["SKIP"] ?? "",
    include: process.env["INCLUDE"] ?? "",
    outputPath: process.env["GITHUB_OUTPUT"] ?? "",
    fileSystem: nodeFileSystem,
    writeOutput: (text) => {
      process.stdout.write(text);
    }
  });
}
export {
  writeSyncEntries
};
