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

// scripts/audit-fix/build-audit-fix-paths.ts
import { join } from "path";
function buildAuditFixPaths(runnerTemp, base, defaultBranch) {
  return {
    branch: base === defaultBranch ? "audit-fix" : `audit-fix-${base.replaceAll("/", "-")}`,
    title: join(runnerTemp, "title.txt"),
    body: join(runnerTemp, "body.md"),
    review: join(runnerTemp, "needs-review.txt"),
    pendingIgnores: join(runnerTemp, "pending-ignores.json"),
    pullRequestBody: join(runnerTemp, "pr-body.md")
  };
}

// scripts/audit-fix/run-audit-fix.ts
import { existsSync } from "fs";
import { readFile as readFile2, rm as rm2, writeFile as writeFile2 } from "fs/promises";
import { parseArgs } from "util";

// packages/std/src/is-record.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// scripts/audit-fix/build-audit-script.ts
function buildAuditScript(script, ignoreIDs) {
  const tokens = script.trim().split(/\s+/u);
  const kept = [];
  for (let index = 0;index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--ignore") {
      index += 1;
    } else if (token !== undefined && !token.startsWith("--ignore=")) {
      kept.push(token);
    }
  }
  const flags = [...new Set(ignoreIDs)].toSorted().map((id) => `--ignore=${id}`);
  return [...kept, ...flags].join(" ");
}

// scripts/audit-fix/build-bunfig-with-excludes.ts
var excludesLine = /^minimumReleaseAgeExcludes\s*=\s*\[/mu;
var gateLine = /^minimumReleaseAge\s*=.*$/mu;
function buildBunfigWithExcludes(bunfig, excludes) {
  const existing = excludesLine.exec(bunfig);
  const current = existing === null ? [] : parseExcludeNames(bunfig, existing.index);
  const added = excludes.filter((exclude) => !current.includes(exclude.name));
  if (added.length === 0) {
    return bunfig;
  }
  const comments = added.map((exclude) => `${renderExcludeComment(exclude)}
`).join("");
  const names = added.map((exclude) => exclude.name);
  if (existing !== null) {
    const end = bunfig.indexOf("]", existing.index);
    const list = buildListWithNames(bunfig.slice(existing.index, end), names);
    return `${bunfig.slice(0, existing.index)}${comments}${list}${bunfig.slice(end)}`;
  }
  const gate = gateLine.exec(bunfig);
  if (gate === null) {
    throw new Error("bunfig.toml sets no minimumReleaseAge, so no release needs an exclude");
  }
  const end = gate.index + gate[0].length;
  const list = `minimumReleaseAgeExcludes = [
${names.map((name) => `  "${name}",
`).join("")}]`;
  return `${bunfig.slice(0, end)}

${comments}${list}${bunfig.slice(end)}`;
}
function parseExcludeNames(bunfig, start) {
  const end = bunfig.indexOf("]", start);
  if (end === -1) {
    throw new Error("bunfig.toml has a minimumReleaseAgeExcludes list with no closing bracket");
  }
  const body = bunfig.slice(bunfig.indexOf("[", start) + 1, end);
  return [...body.matchAll(/"(?<name>[^"]+)"/gu)].map((match) => match.groups?.["name"] ?? "");
}
function renderExcludeComment(exclude) {
  return `# ${exclude.name} ${exclude.version} (published ${exclude.publishedOn}, patches ${exclude.advisories.join(" + ")}) ages past the gate ~${exclude.agesPastGateOn} \u2014 remove then (audit-fix)`;
}
function buildListWithNames(listUpToBracket, names) {
  const lastQuote = listUpToBracket.lastIndexOf('"');
  const isEmpty = lastQuote === -1;
  const rest = listUpToBracket.slice(lastQuote + 1);
  const separated = isEmpty || /^\s*,/u.test(rest) ? listUpToBracket : `${listUpToBracket.slice(0, lastQuote + 1)},${rest}`;
  const body = separated.trimEnd();
  if (listUpToBracket.includes(`
`)) {
    return `${body}
${names.map((name) => `  "${name}",
`).join("")}`;
  }
  const quoted = names.map((name) => `"${name}"`).join(", ");
  return isEmpty ? `${body}${quoted}` : `${body} ${quoted}`;
}

// scripts/audit-fix/build-bunfig-without-expired-excludes.ts
var excludeComment = /^# (?<name>\S+) \S+ \(published [^)]*\) ages past the gate ~(?<date>\d{4}-\d{2}-\d{2}) \u2014 remove then \(audit-fix\)\n/gmu;
function buildBunfigWithoutExpiredExcludes(bunfig, today) {
  const removed = [];
  const withoutComments = bunfig.replaceAll(excludeComment, (line, ...rest) => {
    const groups = rest.at(-1);
    const name = isGroups(groups) ? groups["name"] : undefined;
    const date = isGroups(groups) ? groups["date"] : undefined;
    if (name === undefined || date === undefined || date > today) {
      return line;
    }
    removed.push(name);
    return "";
  });
  if (removed.length === 0) {
    return { bunfig, removed };
  }
  return { bunfig: buildBunfigWithoutNames(withoutComments, removed), removed };
}
function isGroups(value) {
  return typeof value === "object" && value !== null;
}
function buildBunfigWithoutNames(bunfig, names) {
  const start = /^minimumReleaseAgeExcludes\s*=\s*\[/mu.exec(bunfig);
  if (start === null) {
    return bunfig;
  }
  const end = bunfig.indexOf("]", start.index);
  let list = bunfig.slice(start.index, end);
  for (const name of names) {
    const quoted = `"${name}"`;
    list = list.includes(`
`) ? list.split(`
`).map((line) => line.replace(new RegExp(`${RegExp.escape(quoted)}\\s*,?[ \\t]*`, "u"), "")).filter((line, index, lines) => index === 0 || index === lines.length - 1 || line.trim() !== "").join(`
`) : list.replace(new RegExp(`\\s*${RegExp.escape(quoted)}\\s*,?`, "u"), "");
  }
  if (!list.includes(`
`)) {
    list = list.replace(/,\s*$/u, "");
  }
  return `${bunfig.slice(0, start.index)}${list}${bunfig.slice(end)}`;
}

// scripts/audit-fix/build-date-after.ts
function buildDateAfter(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// scripts/audit-fix/parse-audit-ignores.ts
function parseAuditIgnores(value) {
  if (!isRecord(value)) {
    throw new TypeError("audit-ignores.json holds no object");
  }
  return Object.fromEntries(Object.entries(value).map(([advisoryID, ignore]) => {
    if (!isRecord(ignore) || typeof ignore["package"] !== "string" || typeof ignore["reason"] !== "string" || typeof ignore["expires"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(ignore["expires"])) {
      throw new TypeError(`audit-ignores.json needs a package, a reason and an ISO expires date for ${advisoryID}`);
    }
    return [
      advisoryID,
      { package: ignore["package"], reason: ignore["reason"], expires: ignore["expires"] }
    ];
  }));
}

// scripts/audit-fix/types.ts
var severities = ["low", "moderate", "high", "critical"];

// scripts/audit-fix/parse-audit-report.ts
function parseAuditReport(value) {
  if (!isRecord(value)) {
    throw new TypeError("bun audit --json printed no object");
  }
  return Object.fromEntries(Object.entries(value).map(([name, advisories]) => [name, parseAdvisories(name, advisories)]));
}
function parseAdvisories(name, value) {
  if (!Array.isArray(value)) {
    throw new TypeError(`bun audit --json lists no advisories for ${name}`);
  }
  return value.map((advisory) => {
    if (!isRecord(advisory) || typeof advisory["id"] !== "number" || typeof advisory["url"] !== "string" || typeof advisory["title"] !== "string" || typeof advisory["vulnerable_versions"] !== "string" || !isSeverity(advisory["severity"])) {
      throw new TypeError(`bun audit --json has a malformed advisory for ${name}`);
    }
    return {
      id: advisory["id"],
      url: advisory["url"],
      title: advisory["title"],
      severity: advisory["severity"],
      vulnerable_versions: advisory["vulnerable_versions"]
    };
  });
}
function isSeverity(value) {
  return severities.some((severity) => severity === value);
}

// scripts/audit-fix/parse-audit-script.ts
function parseAuditScript(script) {
  const tokens = script.trim().split(/\s+/u);
  const ignoreIDs = [];
  let auditLevel = null;
  for (const [index, token] of tokens.entries()) {
    const ignore = findFlagValue(tokens, index, "--ignore");
    if (ignore !== null) {
      ignoreIDs.push(ignore);
    }
    const level = findFlagValue(tokens, index, "--audit-level");
    if (level !== null) {
      if (!isSeverity2(level)) {
        throw new Error(`the audit script sets an unknown --audit-level: ${level}`);
      }
      auditLevel = level;
    }
    if (token === "&&" || token === ";" || token === "|") {
      throw new Error(`the audit script must be one bun audit command, not a chain: ${script}`);
    }
  }
  return { ignoreIDs, auditLevel };
}
function findFlagValue(tokens, index, flag) {
  const token = tokens[index];
  if (token === undefined) {
    return null;
  }
  if (token.startsWith(`${flag}=`)) {
    return token.slice(flag.length + 1);
  }
  return token === flag ? tokens[index + 1] ?? null : null;
}
function isSeverity2(value) {
  return severities.some((severity) => severity === value);
}

// scripts/audit-fix/parse-fix-plan.ts
function parseFixPlan(value) {
  if (!isRecord(value)) {
    throw new TypeError("bun audit fix --json printed no object");
  }
  return {
    fixes: getList(value, "fixes").map((entry) => parseFixedPackage(entry)),
    blocked: getList(value, "blocked").map((entry) => parseBlockedPackage(entry)),
    unfixable: getList(value, "unfixable").map((entry) => parseUnfixablePackage(entry))
  };
}
function getList(plan, key) {
  const list = plan[key];
  if (!Array.isArray(list)) {
    throw new TypeError(`bun audit fix --json has no ${key} list`);
  }
  return list;
}
function parseFixedPackage(value) {
  if (!isRecord(value) || typeof value["name"] !== "string" || typeof value["from"] !== "string" || typeof value["to"] !== "string" || typeof value["newerThanMinimumReleaseAge"] !== "boolean") {
    throw new TypeError("bun audit fix --json has a malformed fix");
  }
  return {
    name: value["name"],
    from: value["from"],
    to: value["to"],
    newerThanMinimumReleaseAge: value["newerThanMinimumReleaseAge"]
  };
}
function parseBlockedPackage(value) {
  if (!isRecord(value) || typeof value["name"] !== "string" || typeof value["from"] !== "string" || typeof value["to"] !== "string" || !Array.isArray(value["blockers"])) {
    throw new TypeError("bun audit fix --json has a malformed blocked package");
  }
  return {
    name: value["name"],
    from: value["from"],
    to: value["to"],
    blockers: value["blockers"].map((blocker) => {
      if (!isRecord(blocker) || typeof blocker["dependent"] !== "string" || typeof blocker["range"] !== "string") {
        throw new TypeError("bun audit fix --json has a malformed blocker");
      }
      return { dependent: blocker["dependent"], range: blocker["range"] };
    })
  };
}
function parseUnfixablePackage(value) {
  if (!isRecord(value) || typeof value["name"] !== "string") {
    throw new TypeError("bun audit fix --json has a malformed unfixable package");
  }
  return { name: value["name"] };
}

// scripts/audit-fix/parse-json-line.ts
function parseJSONLine(stdout) {
  const line = stdout.split(`
`).toReversed().find((candidate) => candidate.startsWith("{"));
  if (line === undefined) {
    throw new Error(`bun printed no JSON:
${stdout}`);
  }
  return JSON.parse(line);
}

// scripts/audit-fix/plan-audit-ignores.ts
var maxExpiryDays = 90;
function planAuditIgnores(input) {
  const remaining = collectRemainingAdvisories(input.report, input.auditLevel);
  const latest = buildDateAfter(input.today, maxExpiryDays);
  const fallback = buildDateAfter(input.today, Math.min(input.expiryDays, maxExpiryDays));
  const isLive = (expires) => expires > input.today && expires <= latest;
  const pickExpiry = (advisoryID) => {
    const pending = input.pending[advisoryID]?.expires;
    return pending !== undefined && isLive(pending) ? pending : fallback;
  };
  const ignores = {};
  const added = [];
  const renewed = [];
  const removed = [];
  for (const [advisoryID, ignore] of Object.entries(input.ignores)) {
    const advisory = remaining.get(advisoryID);
    if (advisory === undefined) {
      removed.push(advisoryID);
    } else if (isLive(ignore.expires)) {
      ignores[advisoryID] = ignore;
    } else {
      const change = buildIgnoreChange(advisoryID, advisory, input.plan, pickExpiry(advisoryID));
      ignores[advisoryID] = toAuditIgnore(change);
      renewed.push(change);
    }
  }
  for (const [advisoryID, advisory] of remaining) {
    if (!(advisoryID in input.ignores) && !input.unmanagedIDs.includes(advisoryID)) {
      const change = buildIgnoreChange(advisoryID, advisory, input.plan, pickExpiry(advisoryID));
      ignores[advisoryID] = toAuditIgnore(change);
      added.push(change);
    }
  }
  return { ignores: sortIgnores(ignores), added, renewed, removed };
}
function collectRemainingAdvisories(report, auditLevel) {
  const remaining = new Map;
  for (const [packageName, advisories] of Object.entries(report)) {
    for (const advisory of advisories) {
      if (isAtOrAboveLevel(advisory.severity, auditLevel)) {
        remaining.set(getAdvisoryID(advisory.url, advisory.id), {
          packageName,
          title: advisory.title,
          vulnerableVersions: advisory.vulnerable_versions
        });
      }
    }
  }
  return remaining;
}
function isAtOrAboveLevel(severity, level) {
  return level === null || severities.indexOf(severity) >= severities.indexOf(level);
}
function getAdvisoryID(url, id) {
  return /GHSA(?:-[\da-z]{4}){3}/u.exec(url)?.[0] ?? String(id);
}
function buildIgnoreChange(advisoryID, advisory, plan, expires) {
  return {
    advisory: advisoryID,
    title: advisory.title,
    package: advisory.packageName,
    reason: buildIgnoreReason(advisory, plan),
    expires
  };
}
function buildIgnoreReason(advisory, plan) {
  const packageName = advisory.packageName;
  const blocked = plan.blocked.find((entry) => entry.name === packageName);
  if (blocked !== undefined) {
    const blockers = blocked.blockers.map((blocker) => `${blocker.dependent} accepts only ${blocker.range}`).join("; ");
    if (isDowngrade(blocked) && !hasPatchedRelease(advisory.vulnerableVersions)) {
      return `No patched release exists for ${packageName} ${advisory.vulnerableVersions}, and ${blockers}.`;
    }
    return `The fix is ${packageName} ${blocked.to}, but ${blockers}.`;
  }
  if (plan.unfixable.some((entry) => entry.name === packageName)) {
    return `No published release of ${packageName} fixes it.`;
  }
  return `bun audit fix found no fix for ${packageName} that it could apply.`;
}
function isDowngrade(blocked) {
  return Bun.semver.order(blocked.to, blocked.from) < 0;
}
function hasPatchedRelease(vulnerableVersions) {
  return vulnerableVersions.split("||").every((comparators) => /(?:^|[\s,])<(?!=)/u.test(comparators));
}
function toAuditIgnore(change) {
  return { package: change.package, reason: change.reason, expires: change.expires };
}
function sortIgnores(ignores) {
  return Object.fromEntries(Object.entries(ignores).toSorted(([left], [right]) => left.localeCompare(right)));
}

// scripts/audit-fix/render-audit-fix-summary.ts
function renderAuditFixSummary(input) {
  const ignores = input.added.length + input.renewed.length;
  const needsReview = ignores > 0;
  const sections = [
    renderFixes(input.fixes),
    renderExcludes(input.excludes),
    renderIgnores("Ignored until a fix can land", input.added),
    renderIgnores("Ignores renewed, because no fix can land yet", input.renewed),
    renderRemoved(input.removed),
    renderExpiredExcludes(input.expiredExcludes)
  ].filter((section) => section !== "");
  const lead = needsReview ? "The audit-fix workflow opened this pull request after it ran `bun audit` on the base branch. It ignores advisories that no fix reaches, so it waits for a person to review it and never merges by itself." : "The audit-fix workflow opened this pull request after it ran `bun audit` on the base branch.";
  const body = `${[lead, ...sections].join(`

`)}
`;
  if (input.fixes.length > 0) {
    return { title: buildFixTitle(input.fixes, ignores), body, needsReview };
  }
  if (ignores > 0) {
    return {
      title: `chore(deps): ignore ${ignores} unfixed audit ${formatNoun("advisory", ignores)}`,
      body,
      needsReview
    };
  }
  if (input.removed.length > 0 || input.expiredExcludes.length > 0) {
    return {
      title: buildDropTitle(input.removed.length, input.expiredExcludes.length),
      body,
      needsReview
    };
  }
  return { title: "", body: "", needsReview: false };
}
function renderFixes(fixes) {
  if (fixes.length === 0) {
    return "";
  }
  const rows = fixes.map((fix) => `- \`${fix.name}\` ${fix.from} \u2192 ${fix.to}`);
  return ["## Updated to a fixed release", ...rows].join(`
`);
}
function renderExcludes(excludes) {
  if (excludes.length === 0) {
    return "";
  }
  const rows = excludes.map((exclude) => `- \`${exclude.name}\` ${exclude.version}, published ${exclude.publishedOn}; remove the exclude on or after ${exclude.agesPastGateOn}`);
  return [
    "## Release-age excludes",
    "These fixes are younger than `minimumReleaseAge`, so `bunfig.toml` excludes them from the gate until they age past it.",
    ...rows
  ].join(`
`);
}
function renderIgnores(heading, changes) {
  if (changes.length === 0) {
    return "";
  }
  const rows = changes.map((change) => `- ${change.advisory} in \`${change.package}\` (${change.title}), until ${change.expires}: ${change.reason}`);
  return [`## ${heading}`, ...rows].join(`
`);
}
function renderRemoved(removed) {
  if (removed.length === 0) {
    return "";
  }
  return [
    "## Ignores dropped, because the audit no longer reports them",
    ...removed.map((id) => `- ${id}`)
  ].join(`
`);
}
function renderExpiredExcludes(names) {
  if (names.length === 0) {
    return "";
  }
  return [
    "## Release-age excludes dropped, because each release aged past the gate",
    ...names.map((name) => `- \`${name}\``)
  ].join(`
`);
}
var maxTitleLength = 72;
function buildFixTitle(fixes, ignores) {
  const names = [...new Set(fixes.map((fix) => fix.name))];
  const suffix = ignores > 0 ? `, ignore ${ignores} unfixed ${formatNoun("advisory", ignores)}` : " to fix advisories";
  const title = `fix(deps): update ${names.join(", ")}${suffix}`;
  if (title.length <= maxTitleLength) {
    return title;
  }
  return `fix(deps): update ${names.length} ${formatNoun("package", names.length)}${suffix}`;
}
function formatNoun(noun, count) {
  if (count === 1) {
    return noun;
  }
  return noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}
function buildDropTitle(ignores, excludes) {
  if (excludes === 0) {
    return `chore(deps): drop ${ignores} stale audit ${formatNoun("ignore", ignores)}`;
  }
  if (ignores === 0) {
    return `chore(deps): drop ${excludes} aged release-age ${formatNoun("exclude", excludes)}`;
  }
  return "chore(deps): drop stale audit ignores and release-age excludes";
}

// scripts/audit-fix/run-audit-fix.ts
var ignoresPath = "audit-ignores.json";
var gateDays = 7;
async function runAuditFix(argv) {
  const args = parseArgs({
    args: [...argv],
    options: {
      "title-file": { type: "string" },
      "body-file": { type: "string" },
      "review-file": { type: "string" },
      "pending-ignores": { type: "string" },
      "expiry-days": { type: "string", default: "30" }
    }
  });
  const titleFile = args.values["title-file"];
  const bodyFile = args.values["body-file"];
  const reviewFile = args.values["review-file"];
  const pendingPath = args.values["pending-ignores"];
  const expiryDays = Number(args.values["expiry-days"]);
  if (titleFile === undefined || bodyFile === undefined || reviewFile === undefined || !Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90) {
    throw new Error("usage: run-audit-fix.ts --title-file <path> --body-file <path> --review-file <path> [--pending-ignores <path>] [--expiry-days <1-90>]");
  }
  requireAuditFix();
  const today = new Date().toISOString().slice(0, 10);
  const packageJSON = await readFile2("package.json", "utf8");
  const script = readAuditScript(packageJSON);
  const parsedScript = parseAuditScript(script);
  const ignores = await loadAuditIgnores(ignoresPath);
  const pending = pendingPath === undefined ? {} : await loadAuditIgnores(pendingPath);
  const latest = buildDateAfter(today, 90);
  const unmanagedIDs = parsedScript.ignoreIDs.filter((id) => !(id in ignores));
  const activeIDs = Object.entries(ignores).filter(([, ignore]) => ignore.expires > today && ignore.expires <= latest).map(([id]) => id);
  const flags = [...activeIDs, ...unmanagedIDs].map((id) => `--ignore=${id}`);
  const beforeOutput = await runBun(["audit", "--json"]);
  const before = parseAuditReport(parseJSONLine(beforeOutput));
  const planOutput = await runBun(["audit", "fix", "--json", "--ignore-scripts", ...flags]);
  const plan = parseFixPlan(parseJSONLine(planOutput));
  const excludes = await readReleaseAgeExcludes(plan, before, today);
  const expiredExcludes = await updateReleaseAgeExcludes(excludes, today);
  const reportOutput = await runBun(["audit", "--json"]);
  const report = parseAuditReport(parseJSONLine(reportOutput));
  const ignorePlan = planAuditIgnores({
    report,
    ignores,
    unmanagedIDs,
    plan,
    auditLevel: parsedScript.auditLevel,
    today,
    expiryDays,
    pending
  });
  const nextIDs = [...Object.keys(ignorePlan.ignores), ...unmanagedIDs];
  const isScriptChanged = !hasSameIDs(parsedScript.ignoreIDs, nextIDs);
  const nextScript = isScriptChanged ? buildAuditScript(script, nextIDs) : script;
  await writeAuditIgnores(ignorePlan.ignores);
  if (isScriptChanged) {
    await writeAuditScript(nextScript);
  }
  await runBun(nextScript.split(" ").slice(1), { check: true });
  const summary = renderAuditFixSummary({
    fixes: plan.fixes,
    excludes,
    expiredExcludes,
    added: ignorePlan.added,
    renewed: ignorePlan.renewed,
    removed: ignorePlan.removed
  });
  await writeFile2(titleFile, summary.title);
  await writeFile2(bodyFile, summary.body);
  await writeFile2(reviewFile, String(summary.needsReview));
}
function requireAuditFix() {
  const [major = 0, minor = 0] = Bun.version.split(".").map(Number);
  if (major < 1 || major === 1 && minor < 4) {
    throw new Error(`audit-fix needs bun audit fix, which Bun 1.4.0 added; this repo's .bun-version gives Bun ${Bun.version}`);
  }
}
function readAuditScript(packageJSON) {
  const parsed = JSON.parse(packageJSON);
  const scripts = isRecord(parsed) ? parsed["scripts"] : undefined;
  const audit = isRecord(scripts) ? scripts["audit"] : undefined;
  return typeof audit === "string" ? audit : "bun audit";
}
async function loadAuditIgnores(path) {
  if (!existsSync(path)) {
    return {};
  }
  const content = await readFile2(path, "utf8");
  const parsed = JSON.parse(content);
  return parseAuditIgnores(parsed);
}
async function runBun(args, options = {}) {
  const run = Bun.spawn(["bun", ...args], { stdout: "pipe", stderr: "inherit" });
  const [stdout, exitCode] = await Promise.all([new Response(run.stdout).text(), run.exited]);
  if (options.check === true && exitCode !== 0) {
    process.stdout.write(stdout);
    throw new Error(`bun ${args.join(" ")} exited ${exitCode}`);
  }
  return stdout;
}
function readReleaseAgeExcludes(plan, before, today) {
  const young = plan.fixes.filter((fix) => fix.newerThanMinimumReleaseAge);
  return Promise.all(young.map(async (fix) => {
    const publishedOn = await readPublishDate(fix.name, fix.to, today);
    return {
      name: fix.name,
      version: fix.to,
      publishedOn,
      agesPastGateOn: buildDateAfter(publishedOn, gateDays),
      advisories: (before[fix.name] ?? []).map((advisory) => advisory.url.split("/").at(-1) ?? "")
    };
  }));
}
async function readPublishDate(name, version, today) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (!response.ok) {
    return today;
  }
  const manifest = await response.json();
  const time = isRecord(manifest) ? manifest["time"] : undefined;
  const published = isRecord(time) ? time[version] : undefined;
  return typeof published === "string" ? published.slice(0, 10) : today;
}
async function updateReleaseAgeExcludes(excludes, today) {
  if (!existsSync("bunfig.toml")) {
    return [];
  }
  const bunfig = await readFile2("bunfig.toml", "utf8");
  const pruned = buildBunfigWithoutExpiredExcludes(bunfig, today);
  const next = excludes.length > 0 ? buildBunfigWithExcludes(pruned.bunfig, excludes) : pruned.bunfig;
  if (next !== bunfig) {
    await writeFile2("bunfig.toml", next);
  }
  return pruned.removed.filter((name) => !excludes.some((exclude) => exclude.name === name));
}
function hasSameIDs(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
}
async function writeAuditIgnores(ignores) {
  if (Object.keys(ignores).length === 0) {
    await rm2(ignoresPath, { force: true });
    return;
  }
  await writeFile2(ignoresPath, `${JSON.stringify(ignores, null, 2)}
`);
}
async function writeAuditScript(script) {
  const packageJSON = await readFile2("package.json", "utf8");
  const entry = /(?<key>"audit"\s*:\s*)"(?:[^"\\]|\\.)*"/u;
  if (entry.test(packageJSON)) {
    await writeFile2("package.json", packageJSON.replace(entry, `$<key>${JSON.stringify(script)}`));
    return;
  }
  const parsed = JSON.parse(packageJSON);
  if (!isRecord(parsed)) {
    throw new TypeError("package.json holds no object");
  }
  const scripts = isRecord(parsed["scripts"]) ? parsed["scripts"] : {};
  await writeFile2("package.json", `${JSON.stringify({ ...parsed, scripts: { ...scripts, audit: script } }, null, 2)}
`);
}
if (false) {}

// scripts/audit-fix/fix-advisories.ts
async function fixAdvisories(options) {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const hasPending = await copyPendingIgnores(options, paths.branch, paths.pendingIgnores);
  await options.runAuditFix([
    "--title-file",
    paths.title,
    "--body-file",
    paths.body,
    "--review-file",
    paths.review,
    "--expiry-days",
    options.expiryDays,
    ...hasPending ? ["--pending-ignores", paths.pendingIgnores] : []
  ]);
}
async function copyPendingIgnores(options, branch, pendingPath) {
  const git = (args) => options.runCommand(["git", ...args], { cwd: options.cwd, env: options.env });
  const fetched = await git(["fetch", "--quiet", "origin", branch]);
  if (fetched.exitCode !== 0) {
    return false;
  }
  const shown = await git(["show", "FETCH_HEAD:audit-ignores.json"]);
  if (shown.exitCode !== 0) {
    return false;
  }
  await options.fileSystem.writeText(pendingPath, shown.stdout);
  return true;
}
if (import.meta.main) {
  await fixAdvisories({
    cwd: process.cwd(),
    env: process.env,
    runnerTemp: process.env["RUNNER_TEMP"] ?? "",
    base: process.env["BASE"] ?? "",
    defaultBranch: process.env["DEFAULT_BRANCH"] ?? "",
    expiryDays: process.env["EXPIRY_DAYS"] ?? "30",
    fileSystem: nodeFileSystem,
    runAuditFix,
    runCommand
  });
}
export {
  fixAdvisories
};
