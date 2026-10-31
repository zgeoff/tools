// @bun
// scripts/repo-sync/sync-entries.ts
import { join as join3 } from "path";

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

// scripts/repo-sync/build-sync-row-split.ts
var rowSides = {
  copy: "taken",
  skip: "excluded"
};
function buildSyncRowSplit(rows) {
  const taken = [];
  const excluded = [];
  const sides = { taken, excluded };
  for (const row of rows) {
    sides[rowSides[row.action]].push(row);
  }
  return { taken, excluded };
}

// scripts/repo-sync/is-workflow-path.ts
function isWorkflowPath(path) {
  return path.startsWith(".github/workflows/");
}

// scripts/repo-sync/build-copy-plan.ts
function buildCopyPlan(facts) {
  const split = buildSyncRowSplit(facts.rows);
  const excluded = split.excluded.map((row) => row.target);
  const taken = split.taken;
  const conflicts = taken.filter((row) => isOwnWorkflow(facts.existingWorkflows.get(row.target), facts.marker)).map((row) => row.target);
  const copies = taken.filter((row) => !conflicts.includes(row.target)).map((row) => ({
    source: row.source,
    target: row.target,
    mode: row.mode,
    isPinned: isWorkflowPath(row.target)
  }));
  const strippedTargets = excluded.length === 0 ? [] : copies.filter((copy) => copy.target.endsWith(".md")).map((copy) => copy.target);
  return { copies, conflicts, excluded, strippedTargets };
}
var sharedCallPattern = /zgeoff\/tools\/\.github\/workflows\/[^@\s]+/gu;
function isOwnWorkflow(existing, marker) {
  if (existing === undefined || existing.targetText.includes(marker)) {
    return false;
  }
  const calls = new Set(existing.sourceText.match(sharedCallPattern));
  return ![...calls].some((call) => existing.targetText.includes(call));
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

// scripts/repo-sync/pick-sync-commit-verdict.ts
function pickSyncCommitVerdict(facts) {
  if (!facts.isOnMain) {
    return { kind: "refused", message: `${facts.commit} is not a commit on main of zgeoff/tools` };
  }
  const baseVerdict = pickHolderVerdict(facts.commit, {
    holder: facts.base,
    ref: facts.base,
    reading: facts.basePins
  });
  if (baseVerdict !== null) {
    return baseVerdict;
  }
  if (facts.pullRequest === null) {
    return { kind: "current" };
  }
  const pullRequestVerdict = pickHolderVerdict(facts.commit, {
    holder: `Pull request #${facts.pullRequest.number}`,
    ref: facts.pullRequest.branch,
    reading: facts.pullRequest.pins
  });
  return pullRequestVerdict ?? { kind: "current" };
}
function pickHolderVerdict(commit, holder) {
  if (holder.reading.kind === "unreadable") {
    return {
      kind: "refused",
      message: `Cannot read ${holder.ref} from the remote, so the run cannot tell whether ${commit} is older than its pin; the next run tries again: ${holder.reading.reason}`
    };
  }
  const newer = holder.reading.pins.find((pin) => pin.order === "newer");
  if (newer !== undefined) {
    return { kind: "superseded", holder: holder.holder, pin: newer.pin };
  }
  const unknown = holder.reading.pins.find((pin) => pin.order === "unknown");
  if (unknown !== undefined) {
    return {
      kind: "refused",
      message: `Cannot tell whether ${commit} is older than the pin ${unknown.pin} on ${holder.ref}, so the run stops; the next run tries again: ${unknown.reason}`
    };
  }
  return null;
}

// scripts/repo-sync/pick-verdict-stop.ts
var syncVerdictStopPickers = {
  current: () => null,
  refused: (verdict) => ({ exitCode: 1, line: `::error::${verdict.message}
` }),
  superseded: (verdict, commit) => ({
    exitCode: 0,
    line: `${verdict.holder} already pins ${verdict.pin}, which is newer than ${commit}; nothing to do.
`
  })
};
function pickVerdictStop(verdict, commit) {
  const pick = syncVerdictStopPickers[verdict.kind];
  return pick(verdict, commit);
}

// scripts/repo-sync/plan-retired-file-removal.ts
var retiredFilesName = "retired-files";
function planRetiredFileRemoval(facts) {
  if (facts.exitCode !== 0) {
    return { kind: "failed" };
  }
  const removed = facts.removedText.split(`
`).filter((path) => path !== "");
  const pathList = removed.map((path) => `\`${path}\``).join(", ");
  return {
    kind: "removed",
    paths: removed,
    synced: removed.length === 0 ? [] : [
      {
        name: retiredFilesName,
        description: `The copies of files zgeoff/tools no longer syncs: ${pathList}`
      }
    ]
  };
}

// scripts/repo-sync/read-sync-commit-facts.ts
async function readSyncCommitFacts(context, request) {
  const onMain = await runProbe(context, [
    "git",
    "-C",
    ".repo-sync",
    "merge-base",
    "--is-ancestor",
    request.commit,
    "refs/remotes/origin/main"
  ]);
  const basePins = await readRemotePins(context, request.commit, request.base);
  const listed = await runCheckedCommand(context.runCommand, [
    "gh",
    "pr",
    "list",
    "--head",
    request.branch,
    "--state",
    "open",
    "--json",
    "number",
    "--jq",
    ".[0].number // empty"
  ], { cwd: context.cwd, env: context.env });
  const number = listed.stdout.trim();
  const pullRequest = number === "" ? null : {
    number,
    branch: request.branch,
    pins: await readRemotePins(context, request.commit, request.branch)
  };
  return {
    commit: request.commit,
    isOnMain: onMain.exitCode === 0,
    base: request.base,
    basePins,
    pullRequest
  };
}
function runProbe(context, argv) {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}
async function readRemotePins(context, commit, ref) {
  const fetched = await runProbe(context, ["git", "fetch", "-q", "origin", ref]);
  if (fetched.exitCode !== 0) {
    return { kind: "unreadable", reason: fetched.stderr.trim() };
  }
  return readTreePins(context, commit);
}
async function readTreePins(context, commit) {
  const found = await runProbe(context, [
    "git",
    "grep",
    "-h",
    "-o",
    "-E",
    String.raw`zgeoff/tools/\.github/workflows/[^@[:space:]]+@[0-9a-f]{40}`,
    "FETCH_HEAD",
    "--",
    ".github/workflows"
  ]);
  if (found.exitCode > 1) {
    return { kind: "unreadable", reason: found.stderr.trim() };
  }
  const pinned = [...found.stdout.matchAll(/@(?<commit>[0-9a-f]{40})/gu)].flatMap((match) => {
    const pin = match.groups?.["commit"];
    return pin === undefined ? [] : [pin];
  });
  const pins = [];
  for (const pin of new Set(pinned)) {
    const order = await readPinOrder(context, commit, pin);
    pins.push(order);
  }
  return { kind: "read", pins };
}
async function readPinOrder(context, commit, pin) {
  if (pin === commit) {
    return { pin, order: "not-newer" };
  }
  await runProbe(context, ["git", "-C", ".repo-sync", "fetch", "-q", "origin", pin]);
  const older = await runProbe(context, [
    "git",
    "-C",
    ".repo-sync",
    "merge-base",
    "--is-ancestor",
    commit,
    pin
  ]);
  if (older.exitCode > 1) {
    return { pin, order: "unknown", reason: older.stderr.trim() };
  }
  const order = older.exitCode === 0 ? "newer" : "not-newer";
  return { pin, order };
}

// scripts/repo-sync/render-sync-pull-request-title.ts
var maxTitleLength = 72;
function renderSyncPullRequestTitle(synced) {
  const names = synced.map((entry) => renderEntryName(entry.name));
  const [first, second] = names;
  if (names.length === 1) {
    return `chore(sync): update ${first}`;
  }
  const pairTitle = `chore(sync): update ${first} and ${second}`;
  return names.length === 2 && pairTitle.length <= maxTitleLength ? pairTitle : `chore(sync): update ${names.length} shared entries`;
}
var entryKinds = ["skill", "workflow", "hook"];
function renderEntryName(name) {
  if (name === retiredFilesName) {
    return "the retired files";
  }
  const kind = entryKinds.find((candidate) => name.startsWith(`${candidate}-`));
  return kind === undefined ? `the ${name}` : `the ${name.slice(kind.length + 1)} ${kind}`;
}

// scripts/repo-sync/select-sync-files.ts
function selectSyncFiles(files, repo) {
  const name = repo.toLowerCase();
  return files.map((file) => ({
    action: (file.except ?? []).some((except) => except.toLowerCase() === name) ? "skip" : "copy",
    source: file.source,
    target: file.target,
    mode: file.mode ?? "0644"
  }));
}

// scripts/repo-sync/write-copy-plan.ts
import { dirname as dirname2, join } from "path";

// scripts/repo-sync/build-tools-pin.ts
var callPattern = /(?<![A-Za-z0-9._/-])(?<path>zgeoff\/tools\/\.github\/workflows\/[^\]@\s"'{},]+)@[^\]{},\s"'#]+/gu;
var lineEndPattern = /^(?<quote>["']?)\s*(?:#.*)?$/u;
function buildToolsPin(text, commit) {
  return text.split(`
`).map((line) => {
    const last = [...line.matchAll(callPattern)].at(-1);
    if (last === undefined) {
      return line;
    }
    const end = last.index + last[0].length;
    const pinned = line.slice(0, end).replaceAll(callPattern, `$<path>@${commit}`);
    const rest = line.slice(end);
    const lineEnd = lineEndPattern.exec(rest);
    return lineEnd === null ? `${pinned}${rest}` : `${pinned}${lineEnd.groups?.["quote"] ?? ""} # main`;
  }).join(`
`);
}

// scripts/repo-sync/write-copy-plan.ts
async function writeCopyPlan(context, plan) {
  for (const copy of plan.copies) {
    const path = join(context.cwd, copy.target);
    const existing = copy.isPinned ? await readExistingText(context, path) : null;
    await context.fileSystem.createDirectory(join(context.cwd, dirname2(copy.target)));
    await runChecked(context, [
      "install",
      "-m",
      copy.mode,
      `.repo-sync/${copy.source}`,
      copy.target
    ]);
    if (copy.isPinned) {
      const text = await context.fileSystem.readText(path);
      const pinned = buildToolsPin(text, context.commit);
      const isPinOnly = existing !== null && buildToolsPin(existing, context.commit) === pinned;
      const written = isPinOnly ? existing : pinned;
      await context.fileSystem.writeText(path, written);
    }
  }
  for (const target of plan.strippedTargets) {
    await runChecked(context, [
      "bash",
      ".repo-sync/scripts/remove-excluded-blocks.sh",
      target,
      ...plan.excluded
    ]);
  }
}
async function readExistingText(context, path) {
  const exists = await context.fileSystem.probePath(path);
  return exists ? context.fileSystem.readText(path) : null;
}
function runChecked(context, argv) {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}

// scripts/repo-sync/collect-undelivered-paths.ts
import { isDeepStrictEqual } from "util";
function collectUndeliveredPaths(change) {
  const delivered = new Set(change.delivered);
  return change.changed.filter((path) => !delivered.has(path) && !(path === "package.json" && change.packageJSON !== null && isDeclaredScriptsChange(change.packageJSON.before, change.packageJSON.after, change.scripts)));
}
function isDeclaredScriptsChange(beforeText, afterText, scripts) {
  const before = parsePackageJSON(beforeText);
  const after = parsePackageJSON(afterText);
  const beforeScripts = before === null ? null : findScripts(before);
  const afterScripts = after === null ? null : findScripts(after);
  if (before === null || after === null || beforeScripts === null || afterScripts === null) {
    return false;
  }
  const isEachScriptDeclared = Object.entries(scripts).every(([key, value]) => afterScripts[key] === value || afterScripts[key] === beforeScripts[key]);
  return isEachScriptDeclared && isDeepStrictEqual(buildWithoutScripts(before, beforeScripts, scripts), buildWithoutScripts(after, afterScripts, scripts));
}
function parsePackageJSON(text) {
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
function findScripts(packageJSON) {
  const scripts = packageJSON["scripts"] ?? {};
  return isRecord(scripts) ? scripts : null;
}
function buildWithoutScripts(packageJSON, packageScripts, scripts) {
  const keptScripts = Object.fromEntries(Object.entries(packageScripts).filter(([key]) => !Object.hasOwn(scripts, key)));
  return { ...packageJSON, scripts: keptScripts };
}

// scripts/repo-sync/write-sync-auto-merge.ts
var enableAutoMergeMutation = "mutation($pullRequestID: ID!, $head: GitObjectID!) { enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestID, mergeMethod: SQUASH, expectedHeadOid: $head }) { clientMutationId } }";
async function writeSyncAutoMerge(context, request) {
  const viewed = await runChecked2(context, [
    "gh",
    "pr",
    "view",
    request.number,
    "--json",
    "id,baseRefName",
    "--jq",
    String.raw`"\(.id) \(.baseRefName)"`
  ]);
  const [pullRequestID = "", base = ""] = viewed.stdout.trim().split(" ");
  if (base !== request.base) {
    context.writeOutput(`::warning::Pull request #${request.number} merges into ${base}, not ${request.base}, which the run synced from, so it waits for review.
`);
    return;
  }
  const head = await runChecked2(context, ["git", "rev-parse", "HEAD"]);
  const diff = await runChecked2(context, [
    "git",
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    request.start,
    "HEAD"
  ]);
  const changed = diff.stdout.split("\x00").filter((path) => path !== "");
  const packageJSON = changed.includes("package.json") ? await readPackageJSONChange(context, request.start) : null;
  const undelivered = collectUndeliveredPaths({
    changed,
    delivered: request.delivered,
    scripts: request.scripts,
    packageJSON
  });
  if (undelivered.length > 0) {
    context.writeOutput(`::warning::Pull request #${request.number} changes files the manifest does not deliver, so it waits for review: ${undelivered.join(", ")}
`);
    return;
  }
  const armed = await runProbe2(context, [
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${enableAutoMergeMutation}`,
    "-f",
    `pullRequestID=${pullRequestID}`,
    "-f",
    `head=${head.stdout.trim()}`
  ]);
  if (armed.exitCode !== 0) {
    context.writeOutput(`::warning::Auto-merge of pull request #${request.number} did not turn on, so it waits for review: ${armed.stderr.trim()}
`);
    return;
  }
  context.writeOutput(`Turned on auto-merge of pull request #${request.number}.
`);
}
function runChecked2(context, argv) {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}
async function readPackageJSONChange(context, start) {
  const before = await runProbe2(context, ["git", "show", `${start}:package.json`]);
  const after = await runProbe2(context, ["git", "show", "HEAD:package.json"]);
  return before.exitCode === 0 && after.exitCode === 0 ? { before: before.stdout, after: after.stdout } : null;
}
function runProbe2(context, argv) {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

// scripts/repo-sync/write-tools-pins.ts
import { join as join2 } from "path";
async function writeToolsPins(context, commit) {
  const listed = await runChecked3(context, [
    "git",
    "ls-files",
    "-z",
    "--",
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml"
  ]);
  const pinned = [];
  for (const target of listed.stdout.split("\x00").filter((path) => path !== "")) {
    const path = join2(context.cwd, target);
    const text = await context.fileSystem.readText(path);
    const pinnedText = buildToolsPin(text, commit);
    if (pinnedText !== text) {
      await context.fileSystem.writeText(path, pinnedText);
      pinned.push(target);
    }
  }
  if (pinned.length > 0) {
    await runChecked3(context, ["git", "add", "--", ...pinned]);
    await runChecked3(context, [
      "git",
      "commit",
      "-q",
      "-m",
      `chore: pin the zgeoff/tools workflows to ${commit.slice(0, 12)}`,
      "-m",
      `Each call to a zgeoff/tools workflow pins ${commit}, the commit this sync copies.`
    ]);
  }
  return pinned;
}
function runChecked3(context, argv) {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}

// scripts/repo-sync/sync-entries.ts
async function syncEntries(options) {
  const settings = parseSyncSettings(options.env);
  if (settings.kind === "refused") {
    options.writeOutput(`::error::${settings.message}
`);
    return 1;
  }
  const context = {
    ...settings,
    cwd: options.cwd,
    env: options.env,
    fileSystem: options.fileSystem,
    runCommand: options.runCommand,
    runLoggedCommand: options.runLoggedCommand,
    writeOutput: options.writeOutput
  };
  const facts = await readSyncCommitFacts(context, {
    commit: context.commit,
    branch: context.branch,
    base: context.base
  });
  const verdict = pickSyncCommitVerdict(facts);
  const stop = pickVerdictStop(verdict, context.commit);
  if (stop !== null) {
    options.writeOutput(stop.line);
    return stop.exitCode;
  }
  const committed = await commitEntries(context);
  if (committed.synced.length > 0) {
    await removeAutoMerge(context);
  }
  const pushed = await pushSyncBranch(context, committed);
  if (pushed) {
    const number = await writePullRequest(context, committed.synced);
    await writeSyncAutoMerge(context, { ...committed, number, base: context.base });
  }
  await removeEntryBranches(context, pushed, committed.failed);
  if (committed.failed.length > 0) {
    options.writeOutput(`::error::These entries failed and are not in the sync: ${committed.failed.join(", ")}
`);
    return 1;
  }
  return 0;
}
function parseSyncSettings(env) {
  const commit = env["TOOLS_REF"] ?? "";
  if (!isCommitID(commit)) {
    return {
      kind: "refused",
      message: `the tools ref '${commit.replaceAll(":", " ")}' is not a full commit ID`
    };
  }
  const entriesText = env["ENTRIES"] ?? "";
  const entriesJSON = entriesText === "" ? "[]" : entriesText;
  const entriesValue = JSON.parse(entriesJSON);
  const entries = parseSyncEntries(entriesValue);
  if (entries === null) {
    return { kind: "refused", message: "ENTRIES holds no list of manifest entries" };
  }
  return {
    kind: "parsed",
    entries,
    branch: env["BRANCH"] ?? "",
    marker: env["MARKER"] ?? "",
    commit,
    repo: env["REPO"] ?? "",
    skip: env["SKIP"] ?? "",
    base: env["BASE"] ?? ""
  };
}
function isCommitID(ref) {
  return /^[0-9a-f]{40}$/u.test(ref);
}
async function commitEntries(context) {
  const synced = [];
  const failed = [];
  const taken = [];
  const copied = [];
  const scripts = {};
  await context.fileSystem.appendText(join3(context.cwd, ".git/info/exclude"), `/.repo-sync/
`);
  await runSyncCommand(context, [
    "git",
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  ]);
  await runSyncCommand(context, ["git", "config", "user.name", "github-actions[bot]"]);
  await runSyncCommand(context, ["git", "checkout", "-q", "-B", context.branch]);
  const startHead = await runSyncCommand(context, ["git", "rev-parse", "HEAD"]);
  const start = startHead.stdout.trim();
  for (const entry of context.entries) {
    const written = await writeEntry(context, entry);
    if (written === null) {
      context.writeOutput(`::error::${entry.name} failed, so the sync leaves it out.
`);
      await runSyncCommand(context, ["git", "reset", "-q", "--hard"]);
      await runSyncCommand(context, ["git", "clean", "-q", "-f", "-d"]);
      failed.push(entry.name);
      continue;
    }
    taken.push(entry.name);
    copied.push(...written);
    Object.assign(scripts, entry.scripts);
    await runSyncCommand(context, ["git", "add", "-A"]);
    const staged = await runProbeCommand(context, ["git", "diff", "--cached", "--quiet"]);
    if (staged.exitCode === 0) {
      context.writeOutput(`${entry.name} matches the source; nothing to sync.
`);
      continue;
    }
    await runSyncCommand(context, [
      "git",
      "commit",
      "-q",
      "-m",
      `chore: sync ${entry.name} from zgeoff/tools`
    ]);
    synced.push({ name: entry.name, description: entry.description });
  }
  const retired = await removeRetiredFiles(context, taken, copied);
  const committed = retired.kind === "failed" ? { synced, failed: [...failed, retiredFilesName], start, delivered: copied, scripts } : {
    synced: [...synced, ...retired.synced],
    failed,
    start,
    delivered: [...copied, ...retired.paths],
    scripts
  };
  if (committed.synced.length === 0) {
    return committed;
  }
  const pinned = await writeToolsPins(context, context.commit);
  return { ...committed, delivered: [...committed.delivered, ...pinned] };
}
function runSyncCommand(context, argv) {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}
async function writeEntry(context, entry) {
  try {
    const copied = await copyEntryFiles(context, entry);
    if (copied === null) {
      return null;
    }
    if (entry.build !== "") {
      const build = await context.runLoggedCommand(["bash", "-euo", "pipefail", "-c", entry.build], {
        cwd: context.cwd,
        env: context.env
      });
      if (build.exitCode !== 0) {
        context.writeOutput(`::error::${entry.name}: its build exited with ${build.exitCode}
`);
        return null;
      }
    }
    return copied;
  } catch (error) {
    context.writeOutput(`::error::${entry.name}: ${error instanceof Error ? error.message : String(error)}
`);
    return null;
  }
}
async function copyEntryFiles(context, entry) {
  const rows = selectSyncFiles(entry.files, context.repo);
  const existingWorkflows = await readExistingWorkflows(context, rows);
  const plan = buildCopyPlan({ rows, existingWorkflows, marker: context.marker });
  if (plan.conflicts.length > 0) {
    for (const target of plan.conflicts) {
      context.writeOutput(`::error file=${target}::${target} is the repo's own workflow, so ${entry.name} does not overwrite it. Move its jobs to a file with another name, or add ${entry.name} to skip.
`);
    }
    return null;
  }
  await writeCopyPlan(context, plan);
  return plan.copies.map((copy) => copy.target);
}
async function readExistingWorkflows(context, rows) {
  const workflows = new Map;
  const taken = buildSyncRowSplit(rows).taken;
  for (const row of taken.filter((candidate) => isWorkflowPath(candidate.target))) {
    const target = join3(context.cwd, row.target);
    const exists = await context.fileSystem.probePath(target);
    if (exists) {
      const targetText = await context.fileSystem.readText(target);
      const sourceText = await context.fileSystem.readText(join3(context.cwd, ".repo-sync", row.source));
      workflows.set(row.target, { targetText, sourceText });
    }
  }
  return workflows;
}
function runProbeCommand(context, argv) {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}
async function removeRetiredFiles(context, taken, copied) {
  const script = ".repo-sync/scripts/remove-retired-sync-files.sh";
  const hasScript = await context.fileSystem.probePath(join3(context.cwd, script));
  if (!hasScript) {
    context.writeOutput(`The tools ref has no retired-file cleanup; nothing to remove.
`);
    return { kind: "removed", synced: [], paths: [] };
  }
  const takenList = taken.map((name) => `${name},`).join("");
  const result = await runProbeCommand(context, [
    "bash",
    script,
    ".repo-sync",
    takenList,
    context.skip,
    copied.join(`
`)
  ]);
  context.writeOutput(result.stderr);
  const removal = planRetiredFileRemoval({ exitCode: result.exitCode, removedText: result.stdout });
  return applyRetiredFileRemoval(removal, context);
}
var retiredFileRemovalAppliers = {
  failed: async (_removal, context) => {
    context.writeOutput(`::error::${retiredFilesName} failed, so the sync leaves it out.
`);
    await runSyncCommand(context, ["git", "reset", "-q", "--hard"]);
    return { kind: "failed" };
  },
  removed: async (removal, context) => {
    if (removal.synced.length > 0) {
      await runSyncCommand(context, ["git", "add", "-A"]);
      await runSyncCommand(context, [
        "git",
        "commit",
        "-q",
        "-m",
        "chore: remove the files zgeoff/tools no longer syncs"
      ]);
    }
    return { kind: "removed", synced: removal.synced, paths: removal.paths };
  }
};
function applyRetiredFileRemoval(removal, context) {
  const apply = retiredFileRemovalAppliers[removal.kind];
  return apply(removal, context);
}
async function removeAutoMerge(context) {
  const listed = await runSyncCommand(context, [
    "gh",
    "pr",
    "list",
    "--head",
    context.branch,
    "--state",
    "open",
    "--json",
    "number,autoMergeRequest",
    "--jq",
    ".[] | select(.autoMergeRequest != null) | .number"
  ]);
  for (const number of listed.stdout.split(`
`).filter((line) => line !== "")) {
    await runSyncCommand(context, ["gh", "pr", "merge", number, "--disable-auto"]);
  }
}
async function pushSyncBranch(context, committed) {
  if (committed.synced.length > 0) {
    await runSyncCommand(context, ["git", "push", "-q", "--force", "origin", context.branch]);
    return true;
  }
  const hasRemoteBranch = await probeRemoteBranch(context, context.branch);
  if (committed.failed.length === 0 && hasRemoteBranch) {
    context.writeOutput(`Every entry matches the source; deleting ${context.branch}.
`);
    await runSyncCommand(context, ["git", "push", "-q", "origin", "--delete", context.branch]);
  }
  return false;
}
async function probeRemoteBranch(context, branch) {
  const argv = ["git", "ls-remote", "--exit-code", "--heads", "origin", branch];
  const result = await runProbeCommand(context, argv);
  if (result.exitCode === 0 || result.exitCode === 2) {
    return result.exitCode === 0;
  }
  throw new Error(`${argv.join(" ")} exited with ${result.exitCode}: ${result.stderr}`);
}
async function writePullRequest(context, synced) {
  const title = renderSyncPullRequestTitle(synced);
  const body = renderPullRequestBody(context.commit, synced);
  const listed = await runSyncCommand(context, [
    "gh",
    "pr",
    "list",
    "--head",
    context.branch,
    "--state",
    "open",
    "--json",
    "number",
    "--jq",
    ".[0].number // empty"
  ]);
  const number = listed.stdout.trim();
  if (number !== "") {
    await runSyncCommand(context, ["gh", "pr", "edit", number, "--title", title, "--body", body]);
    context.writeOutput(`Updated pull request #${number} for ${context.branch}.
`);
    return number;
  }
  const created = await runSyncCommand(context, [
    "gh",
    "pr",
    "create",
    "--base",
    context.base,
    "--head",
    context.branch,
    "--title",
    title,
    "--body",
    body
  ]);
  context.writeOutput(created.stdout);
  const url = created.stdout.trim();
  return url.slice(url.lastIndexOf("/") + 1);
}
function renderPullRequestBody(commit, synced) {
  const lines = synced.map((entry) => `- \`${entry.name}\`: ${entry.description}`);
  return `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:

${lines.join(`
`)}`;
}
async function removeEntryBranches(context, pushed, failed) {
  if (!pushed && failed.length > 0) {
    context.writeOutput(`No pull request published; the per-entry branches stay.
`);
    return;
  }
  for (const entry of context.entries.filter((candidate) => !failed.includes(candidate.name))) {
    const branch = `sync/${entry.name}`;
    const hasBranch = await probeRemoteBranch(context, branch);
    if (hasBranch) {
      await runSyncCommand(context, ["git", "push", "-q", "origin", "--delete", branch]);
    }
  }
}
if (import.meta.main) {
  process.exitCode = await syncEntries({
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
  syncEntries
};
