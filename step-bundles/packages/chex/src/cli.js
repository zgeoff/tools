#!/usr/bin/env bun
// @bun

// packages/chex/src/cli.ts
import { rename, rm } from "fs/promises";
import { join as join6 } from "path";
// packages/std/src/is-record.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// packages/std/src/read-optional-text.ts
import { readFile } from "fs/promises";
async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }
}
function isMissingFileError(error) {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
// packages/chex/src/dependency-gates/run-dependency-gates-check.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// packages/chex/src/run-program.ts
function runProgram(argv, options) {
  const result = Bun.spawnSync([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: options.stdin === undefined ? "ignore" : Buffer.from(options.stdin),
    stdout: "pipe",
    stderr: "pipe"
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

// packages/chex/src/dependency-gates/collect-stale-age-gate-excludes.ts
import assert from "assert/strict";

// packages/chex/src/dependency-gates/first-party-scopes.ts
var firstPartyScopes = ["@zgeoff/", "@impz/"];

// packages/chex/src/dependency-gates/is-record.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/chex/src/dependency-gates/collect-stale-age-gate-excludes.ts
function collectStaleAgeGateExcludes(bunfig, today) {
  const removalDates = collectRemovalDates(bunfig);
  return parseAgeGateExcludes(bunfig).filter((name) => !firstPartyScopes.some((scope) => name.startsWith(scope))).flatMap((name) => {
    const removalDate = removalDates.get(name);
    if (removalDate === undefined) {
      return [
        {
          path: "bunfig.toml",
          entry: name,
          problem: "the age-gate exclude has no dated removal comment"
        }
      ];
    }
    if (removalDate < today) {
      return [
        {
          path: "bunfig.toml",
          entry: name,
          problem: `the age-gate exclude was due for removal on ${removalDate}`
        }
      ];
    }
    return [];
  });
}
var removalCommentPattern = /^# (?<name>\S+) \S+ \(published [^)]*\) ages past the gate ~(?<date>\d{4}-\d{2}-\d{2}) \u2014 remove then/gmu;
function collectRemovalDates(bunfig) {
  const removalDates = new Map;
  for (const match of bunfig.matchAll(removalCommentPattern)) {
    const name = match.groups?.["name"];
    const date = match.groups?.["date"];
    assert.ok(name !== undefined && date !== undefined, "the removal comment pattern names both");
    const latest = removalDates.get(name);
    if (latest === undefined || date > latest) {
      removalDates.set(name, date);
    }
  }
  return removalDates;
}
function parseAgeGateExcludes(bunfig) {
  const parsed = Bun.TOML.parse(bunfig);
  const install = isRecord2(parsed) ? parsed["install"] : undefined;
  const excludes = isRecord2(install) ? install["minimumReleaseAgeExcludes"] : undefined;
  if (excludes === undefined) {
    return [];
  }
  if (!isStringList(excludes)) {
    throw new TypeError("bunfig.toml sets a minimumReleaseAgeExcludes that is not a list of names");
  }
  return excludes;
}
function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// packages/chex/src/dependency-gates/collect-unneeded-audit-ignores.ts
function collectUnneededAuditIgnores(input) {
  return input.ignoreIDs.flatMap((ignoreID) => {
    const matches = input.advisories.filter((advisory) => advisory.advisoryIDs.includes(ignoreID));
    if (matches.length === 0) {
      return [
        {
          path: "package.json",
          entry: ignoreID,
          problem: "no locked package has the ignored advisory"
        }
      ];
    }
    const fixable = matches.find((advisory) => input.fixablePackages.includes(advisory.packageName));
    if (fixable !== undefined) {
      return [
        {
          path: "package.json",
          entry: ignoreID,
          problem: `bun audit fix can move ${fixable.packageName} to a patched release in range`
        }
      ];
    }
    return [];
  });
}

// packages/chex/src/dependency-gates/collect-unneeded-overrides.ts
function collectUnneededOverrides(input) {
  return Object.entries(input.overrides).flatMap(([name, pin]) => {
    const ranges = input.dependents.filter((dependent) => dependent.name === name).map((dependent) => resolveCatalogRange(input, name, dependent.range));
    if (ranges.length === 0) {
      return [
        {
          path: "package.json",
          entry: name,
          problem: "no package in bun.lock depends on the overridden package"
        }
      ];
    }
    const isPinOutsideARange = ranges.some((range) => !isSemverRange(range) || !Bun.semver.satisfies(pin, range));
    const isPinTheCatalogVersion = input.catalog[name] === pin;
    if (isPinOutsideARange || isPinTheCatalogVersion) {
      return [];
    }
    return [
      {
        path: "package.json",
        entry: name,
        problem: `every range in bun.lock already admits ${pin}, so the override changes nothing`
      }
    ];
  });
}
function resolveCatalogRange(input, name, range) {
  if (!range.startsWith("catalog:")) {
    return range;
  }
  const catalogName = range.slice("catalog:".length);
  const catalog = catalogName === "" ? input.catalog : input.catalogs[catalogName];
  return catalog?.[name] ?? range;
}
var comparatorPattern = /^(?:[<>]=?|=|\^|~)?v?(?:\d+|[*Xx])(?:\.(?:\d+|[*Xx])){0,2}(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u;
function isSemverRange(range) {
  return range.split("||").every((part) => part.trim().split(/\s+/u).every((token) => token === "" || token === "-" || comparatorPattern.test(token)));
}

// packages/chex/src/dependency-gates/parse-audit-advisories.ts
function parseAuditAdvisories(output) {
  const report = JSON.parse(output);
  if (!isRecord2(report)) {
    throw new TypeError("bun audit --json printed no object");
  }
  return Object.entries(report).flatMap(([packageName, advisories]) => {
    if (!Array.isArray(advisories)) {
      throw new TypeError(`bun audit --json lists no advisories for ${packageName}`);
    }
    return advisories.map((advisory) => {
      if (!isRecord2(advisory) || typeof advisory["id"] !== "number" || typeof advisory["url"] !== "string") {
        throw new TypeError(`bun audit --json has an advisory with no id or url for ${packageName}`);
      }
      return {
        advisoryIDs: [String(advisory["id"]), ...advisory["url"].split("/").slice(-1)],
        packageName
      };
    });
  });
}

// packages/chex/src/shell-escape-parsers.ts
var shellEscapeParsers = {
  code: parseCodeEscape,
  backtick: makeBacktickEscapeParser("$`\\"),
  "quoted-backtick": makeBacktickEscapeParser("$`\\\""),
  literal: parseLiteralEscape,
  "double-quote": parseDoubleQuotedEscape,
  "ansi-c": parseANSICEscape
};
function parseCodeEscape(command, index) {
  const escaped = command.charAt(index + 1);
  if (escaped === "") {
    return { text: "\\", length: 1, isQuoting: false };
  }
  return escaped === `
` ? { text: "", length: 2, isQuoting: false } : { text: escaped, length: 2, isQuoting: true };
}
function makeBacktickEscapeParser(escapable) {
  return (command, index) => {
    const first = readFirstPass(command, index, escapable);
    if (first.length === 1) {
      return parseCodeEscape(command, index);
    }
    if (first.text === "`") {
      return { text: "`", length: 2, isQuoting: true };
    }
    if (first.text !== "\\") {
      return { text: "", length: 1, isQuoting: false };
    }
    const next = readFirstPass(command, index + 2, escapable);
    if (next.text === "") {
      return { text: "\\", length: 2, isQuoting: false };
    }
    return next.text === `
` ? { text: "", length: 2 + next.length, isQuoting: false } : { text: next.text, length: 2 + next.length, isQuoting: true };
  };
}
function readFirstPass(command, index, escapable) {
  const character = command.charAt(index);
  const escaped = command.charAt(index + 1);
  return character === "\\" && escaped !== "" && escapable.includes(escaped) ? { text: escaped, length: 2 } : { text: character, length: 1 };
}
function parseLiteralEscape() {
  return { text: "\\", length: 1, isQuoting: false };
}
var doubleQuotedEscapable = '$`"\\\n';
function parseDoubleQuotedEscape(command, index) {
  const escaped = command.charAt(index + 1);
  if (escaped === "" || !doubleQuotedEscapable.includes(escaped)) {
    return { text: "\\", length: 1, isQuoting: false };
  }
  return { text: escaped === `
` ? "" : escaped, length: 2, isQuoting: false };
}
var ansiCEscapes = new Map([
  ["a", "\x07"],
  ["b", "\b"],
  ["e", "\x1B"],
  ["E", "\x1B"],
  ["f", "\f"],
  ["n", `
`],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
  ["\\", "\\"],
  ["'", "'"],
  ['"', '"'],
  ["?", "?"]
]);
var ansiCBytePattern = /^\\(?:(?<octal>[0-7]{1,3})|x(?<hex>[\dA-Fa-f]{1,2}))/u;
var ansiCCodePattern = /^\\(?:u(?<unicode>[\dA-Fa-f]{1,4})|U(?<wide>[\dA-Fa-f]{1,8})|c(?<control>[\s\S]))/u;
function parseANSICEscape(command, index) {
  const named = ansiCEscapes.get(command.charAt(index + 1));
  const escape = named === undefined ? parseANSICNumber(command, index) : { text: named, length: 2, isQuoting: false };
  const end = escape?.text.indexOf("\x00") ?? -1;
  if (escape === undefined) {
    return { text: "\\", length: 1, isQuoting: false };
  }
  return end === -1 ? escape : {
    text: escape.text.slice(0, end),
    length: getANSICQuoteEnd(command, index + escape.length) - index,
    isQuoting: false
  };
}
function parseANSICNumber(command, index) {
  const bytes = [];
  let length = 0;
  let match = ansiCBytePattern.exec(command.slice(index));
  while (match?.groups !== undefined) {
    const octal = match.groups["octal"];
    bytes.push((octal === undefined ? Number.parseInt(match.groups["hex"] ?? "", 16) : Number.parseInt(octal, 8)) & 255);
    length += match[0].length;
    match = ansiCBytePattern.exec(command.slice(index + length));
  }
  if (bytes.length > 0) {
    return { text: new TextDecoder().decode(new Uint8Array(bytes)), length, isQuoting: false };
  }
  const code = ansiCCodePattern.exec(command.slice(index, index + 10));
  return code?.groups === undefined ? undefined : { text: parseANSICCode(code.groups), length: code[0].length, isQuoting: false };
}
function parseANSICCode(groups) {
  const control = groups["control"];
  const point = Number.parseInt(groups["unicode"] ?? groups["wide"] ?? "", 16);
  if (control !== undefined) {
    return String.fromCodePoint((control.toUpperCase().codePointAt(0) ?? 0) ^ 64);
  }
  return point <= 1114111 ? String.fromCodePoint(point) : "";
}
function getANSICQuoteEnd(command, start) {
  let index = start;
  while (index < command.length && command.charAt(index) !== "'") {
    index += command.charAt(index) === "\\" ? 2 : 1;
  }
  return Math.min(index, command.length);
}

// packages/chex/src/parse-shell-words.ts
var contextTable = {
  plain: {
    pickAction: makeCodeReader({ closer: "", isGrouping: false, isCommenting: true }),
    parseEscape: shellEscapeParsers.code,
    isTopLevel: true,
    isQuote: false
  },
  substitution: {
    pickAction: makeCodeReader({ closer: ")", isGrouping: true, isCommenting: false }),
    parseEscape: shellEscapeParsers.code,
    isTopLevel: false,
    isQuote: false
  },
  group: {
    pickAction: makeCodeReader({ closer: ")", isGrouping: true, isCommenting: false }),
    parseEscape: shellEscapeParsers.code,
    isTopLevel: false,
    isQuote: false
  },
  backtick: {
    pickAction: makeCodeReader({ closer: "`", isGrouping: false, isCommenting: false }),
    parseEscape: shellEscapeParsers.backtick,
    isTopLevel: false,
    isQuote: false
  },
  "quoted-backtick": {
    pickAction: makeCodeReader({ closer: "`", isGrouping: false, isCommenting: false }),
    parseEscape: shellEscapeParsers["quoted-backtick"],
    isTopLevel: false,
    isQuote: false
  },
  "single-quote": {
    pickAction: pickSingleQuotedAction,
    parseEscape: shellEscapeParsers.literal,
    isTopLevel: false,
    isQuote: true
  },
  "ansi-c-quote": {
    pickAction: pickANSICQuotedAction,
    parseEscape: shellEscapeParsers["ansi-c"],
    isTopLevel: false,
    isQuote: true
  },
  "double-quote": {
    pickAction: pickDoubleQuotedAction,
    parseEscape: shellEscapeParsers["double-quote"],
    isTopLevel: false,
    isQuote: true
  },
  parameter: {
    pickAction: pickParameterAction,
    parseEscape: shellEscapeParsers.code,
    isTopLevel: false,
    isQuote: false
  },
  "quoted-parameter": {
    pickAction: pickQuotedParameterAction,
    parseEscape: shellEscapeParsers["double-quote"],
    isTopLevel: false,
    isQuote: false
  },
  arithmetic: {
    pickAction: makeArithmeticReader("))"),
    parseEscape: shellEscapeParsers["double-quote"],
    isTopLevel: false,
    isQuote: false
  },
  "arithmetic-group": {
    pickAction: makeArithmeticReader(")"),
    parseEscape: shellEscapeParsers["double-quote"],
    isTopLevel: false,
    isQuote: false
  }
};
function parseShellWords(command) {
  const state = {
    command,
    words: [],
    contexts: ["plain"],
    index: 0,
    text: "",
    isQuoted: false,
    redirect: "",
    plainText: "",
    isPlain: true
  };
  while (state.index < command.length) {
    const rules = contextTable[getContext(state)];
    const action = rules.pickAction({
      character: command.charAt(state.index),
      ahead: command.slice(state.index + 1, state.index + 3),
      isWordStart: state.text === "" && !state.isQuoted,
      redirect: state.redirect
    });
    advanceParser(state, action, rules.isTopLevel);
  }
  endWord(state);
  return state.words;
}
function makeCodeReader(rules) {
  return (cursor) => {
    const character = cursor.character;
    if (character === rules.closer) {
      return { kind: "close", text: character };
    }
    const opening = pickOpening(cursor, false);
    if (opening !== undefined) {
      return opening;
    }
    if (character === "'") {
      return { kind: "open", context: "single-quote", text: "", length: 1 };
    }
    if (character === '"') {
      return { kind: "open", context: "double-quote", text: "", length: 1 };
    }
    if (character === "(" && rules.isGrouping) {
      return { kind: "open", context: "group", text: "(", length: 1 };
    }
    if (character === "#" && cursor.isWordStart && rules.isCommenting) {
      return { kind: "comment" };
    }
    if (character === `
`) {
      return { kind: "operator", text: `
` };
    }
    if (/\s/u.test(character)) {
      return { kind: "break" };
    }
    return pickOperator(cursor) ?? pickPlainAction(character);
  };
}
function pickOpening(cursor, isInsideQuotes) {
  const character = cursor.character;
  if (character === "\\") {
    return { kind: "escape" };
  }
  if (character === "`") {
    return isInsideQuotes ? { kind: "open", context: "quoted-backtick", text: "`", length: 1 } : { kind: "open", context: "backtick", text: "`", length: 1 };
  }
  if (character !== "$") {
    return;
  }
  if (cursor.ahead.startsWith("'") && !isInsideQuotes) {
    return { kind: "open", context: "ansi-c-quote", text: "", length: 2 };
  }
  if (cursor.ahead.startsWith('"') && !isInsideQuotes) {
    return { kind: "open", context: "double-quote", text: "", length: 2 };
  }
  if (cursor.ahead.startsWith("{")) {
    return isInsideQuotes ? { kind: "open", context: "quoted-parameter", text: "${", length: 2 } : { kind: "open", context: "parameter", text: "${", length: 2 };
  }
  if (cursor.ahead === "((") {
    return { kind: "open", context: "arithmetic", text: "$((", length: 3 };
  }
  if (cursor.ahead.startsWith("(")) {
    return { kind: "open", context: "substitution", text: "$(", length: 2 };
  }
  return;
}
function pickOperator(cursor) {
  const character = cursor.character;
  const ahead = cursor.ahead;
  if (character === ";") {
    return { kind: "operator", text: ";" };
  }
  if (character === "|" && cursor.redirect !== ">") {
    return { kind: "operator", text: ahead.startsWith("|") ? "||" : "|" };
  }
  if (character === "&" && ahead.startsWith("&")) {
    return { kind: "operator", text: "&&" };
  }
  if (character === "&" && cursor.redirect === "" && !ahead.startsWith(">")) {
    return { kind: "operator", text: "&" };
  }
  return;
}
function pickPlainAction(character) {
  return character === ">" || character === "<" ? { kind: "redirect", text: character } : { kind: "text", text: character };
}
function pickSingleQuotedAction(cursor) {
  if (cursor.character === "\\") {
    return { kind: "escape" };
  }
  return cursor.character === "'" ? { kind: "close", text: "" } : { kind: "text", text: cursor.character };
}
function pickANSICQuotedAction(cursor) {
  if (cursor.character === "\\") {
    return { kind: "escape" };
  }
  return cursor.character === "'" ? { kind: "close", text: "" } : { kind: "text", text: cursor.character };
}
function pickDoubleQuotedAction(cursor) {
  const opening = pickOpening(cursor, true);
  if (opening !== undefined) {
    return opening;
  }
  return cursor.character === '"' ? { kind: "close", text: "" } : { kind: "text", text: cursor.character };
}
function pickParameterAction(cursor) {
  const opening = pickOpening(cursor, false);
  if (opening !== undefined) {
    return opening;
  }
  if (cursor.character === "'") {
    return { kind: "open", context: "single-quote", text: "", length: 1 };
  }
  if (cursor.character === '"') {
    return { kind: "open", context: "double-quote", text: "", length: 1 };
  }
  return cursor.character === "}" ? { kind: "close", text: "}" } : { kind: "text", text: cursor.character };
}
function pickQuotedParameterAction(cursor) {
  const opening = pickOpening(cursor, true);
  if (opening !== undefined) {
    return opening;
  }
  if (cursor.character === '"') {
    return { kind: "open", context: "double-quote", text: "", length: 1 };
  }
  return cursor.character === "}" ? { kind: "close", text: "}" } : { kind: "text", text: cursor.character };
}
function makeArithmeticReader(closer) {
  return (cursor) => {
    const character = cursor.character;
    const opening = pickOpening(cursor, true);
    if (opening !== undefined) {
      return opening;
    }
    if (character === "(") {
      return { kind: "open", context: "arithmetic-group", text: "(", length: 1 };
    }
    if (`${character}${cursor.ahead}`.startsWith(closer)) {
      return { kind: "close", text: closer };
    }
    return { kind: "text", text: character };
  };
}
function getContext(state) {
  const context = state.contexts.at(-1);
  if (context === undefined) {
    throw new Error("the shell parser closed its plain context");
  }
  return context;
}
var actionHandlers = {
  text: appendText,
  redirect: (state, action) => {
    state.redirect = action.text;
    return appendText(state, action);
  },
  escape: (state, _action, isTopLevel) => {
    const escape = contextTable[getContext(state)].parseEscape(state.command, state.index);
    state.text += escape.text;
    if (escape.isQuoting) {
      state.isPlain = false;
      state.isQuoted ||= isTopLevel;
    }
    return escape.length;
  },
  open: (state, action, isTopLevel) => {
    state.isPlain = false;
    state.contexts.push(action.context);
    state.text += action.text;
    state.isQuoted ||= isTopLevel && contextTable[action.context].isQuote;
    return action.length;
  },
  close: (state, action) => {
    state.contexts.pop();
    state.text += action.text;
    return Math.max(action.text.length, 1);
  },
  break: (state) => {
    endWord(state);
    return 1;
  },
  operator: (state, action) => {
    endWord(state);
    state.words.push({ text: action.text, isQuoted: false, isOperator: true, isAssignment: false });
    return action.text.length;
  },
  comment: (state) => {
    const end = state.command.indexOf(`
`, state.index);
    return (end === -1 ? state.command.length : end) - state.index;
  }
};
function advanceParser(state, action, isTopLevel) {
  const handler = actionHandlers[action.kind];
  state.redirect = "";
  state.index += handler(state, action, isTopLevel);
}
function appendText(state, action) {
  state.text += action.text;
  state.plainText += state.isPlain ? action.text : "";
  return 1;
}
var assignmentPattern = /^[A-Za-z_]\w*=/u;
function endWord(state) {
  if (state.text !== "" || state.isQuoted) {
    state.words.push({
      text: state.text,
      isQuoted: state.isQuoted,
      isOperator: false,
      isAssignment: assignmentPattern.test(state.plainText)
    });
  }
  state.text = "";
  state.isQuoted = false;
  state.plainText = "";
  state.isPlain = true;
}

// packages/chex/src/dependency-gates/parse-audit-ignore-ids.ts
function parseAuditIgnoreIDs(auditScript) {
  const words = parseShellWords(auditScript).map((word) => word.text);
  return words.flatMap((word, index) => {
    if (word.startsWith("--ignore=")) {
      return [word.slice("--ignore=".length)];
    }
    const next = words[index + 1];
    return word === "--ignore" && next !== undefined ? [next] : [];
  });
}

// packages/chex/src/dependency-gates/parse-fixable-packages.ts
function parseFixablePackages(output) {
  const plan = JSON.parse(output);
  if (!isRecord2(plan)) {
    throw new TypeError("bun audit fix --json printed no object");
  }
  const stuck = new Set([...collectNames(plan, "blocked"), ...collectNames(plan, "unfixable")]);
  return [...new Set(collectNames(plan, "fixes"))].filter((name) => !stuck.has(name));
}
function collectNames(plan, key) {
  const list = plan[key];
  if (!Array.isArray(list)) {
    throw new TypeError(`bun audit fix --json has no ${key} list`);
  }
  return list.map((entry) => {
    if (!isRecord2(entry) || typeof entry["name"] !== "string") {
      throw new TypeError(`bun audit fix --json has an entry with no name in its ${key} list`);
    }
    return entry["name"];
  });
}

// packages/chex/src/dependency-gates/parse-lockfile-dependents.ts
function parseLockfileDependents(lockfile) {
  const parsed = Bun.JSONC.parse(lockfile);
  const workspaces = isRecord2(parsed) ? parsed["workspaces"] : undefined;
  const packages = isRecord2(parsed) ? parsed["packages"] : undefined;
  if (!isRecord2(workspaces)) {
    throw new TypeError("bun.lock has no workspaces object");
  }
  if (!isRecord2(packages)) {
    throw new TypeError("bun.lock has no packages object");
  }
  return [
    ...Object.entries(workspaces).flatMap(([path, workspace]) => collectWorkspaceDependents(path, workspace)),
    ...Object.values(packages).flatMap((entry) => collectPackageDependents(entry))
  ];
}
var workspaceFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
];
function collectWorkspaceDependents(path, workspace) {
  const dependent = path === "" ? "the root workspace" : path;
  return collectDeclaredRanges(dependent, workspace, workspaceFields);
}
function collectDeclaredRanges(dependent, metadata, fields) {
  if (!isRecord2(metadata)) {
    return [];
  }
  return fields.flatMap((field) => {
    const ranges = metadata[field];
    if (!isRecord2(ranges)) {
      return [];
    }
    return Object.entries(ranges).flatMap(([name, range]) => typeof range === "string" ? [{ dependent, name, range }] : []);
  });
}
var packageFields = ["dependencies", "optionalDependencies", "peerDependencies"];
function collectPackageDependents(entry) {
  const [dependent, , metadata] = isList(entry) ? entry : [];
  if (typeof dependent !== "string") {
    throw new TypeError("bun.lock has a package entry that does not start with its id");
  }
  return collectDeclaredRanges(dependent, metadata, packageFields);
}
function isList(value) {
  return Array.isArray(value);
}

// packages/chex/src/dependency-gates/parse-root-manifest.ts
function parseRootManifest(text) {
  const manifest = JSON.parse(text);
  if (!isRecord2(manifest)) {
    throw new TypeError("package.json holds no object");
  }
  const workspaces = manifest["workspaces"];
  const catalog = isRecord2(workspaces) ? workspaces["catalog"] : undefined;
  const catalogs = isRecord2(workspaces) ? workspaces["catalogs"] : undefined;
  const scripts = manifest["scripts"];
  const audit = isRecord2(scripts) ? scripts["audit"] : undefined;
  return {
    overrides: parseVersions(manifest["overrides"], "overrides"),
    catalog: parseVersions(catalog, "workspaces.catalog"),
    catalogs: parseNamedCatalogs(catalogs),
    auditScript: typeof audit === "string" ? audit : ""
  };
}
function parseVersions(value, field) {
  if (value === undefined) {
    return {};
  }
  if (!isRecord2(value)) {
    throw new TypeError(`package.json sets ${field} to a value that is not an object`);
  }
  return Object.fromEntries(Object.entries(value).map(([name, version]) => {
    if (typeof version !== "string") {
      throw new TypeError(`package.json sets the ${field} entry for ${name} to a value that is not a version`);
    }
    return [name, version];
  }));
}
function parseNamedCatalogs(value) {
  if (value === undefined) {
    return {};
  }
  if (!isRecord2(value)) {
    throw new TypeError("package.json sets workspaces.catalogs to a value that is not an object");
  }
  return Object.fromEntries(Object.entries(value).map(([catalogName, versions]) => [
    catalogName,
    parseVersions(versions, `workspaces.catalogs.${catalogName}`)
  ]));
}

// packages/chex/src/dependency-gates/read-dependency-gate-findings.ts
function readDependencyGateFindings(sources) {
  const manifestText = sources.readRepoFile("package.json");
  if (manifestText === null) {
    throw new Error("the repo has no package.json");
  }
  const manifest = parseRootManifest(manifestText);
  const ignoreIDs = parseAuditIgnoreIDs(manifest.auditScript);
  return [
    ...collectStaleAgeGateExcludes(sources.readRepoFile("bunfig.toml") ?? "", sources.today),
    ...readOverrideFindings(sources, manifest),
    ...ignoreIDs.length === 0 ? [] : readIgnoreFindings(sources, ignoreIDs)
  ];
}
function readOverrideFindings(sources, manifest) {
  if (Object.keys(manifest.overrides).length === 0) {
    return [];
  }
  const lockfile = sources.readRepoFile("bun.lock");
  if (lockfile === null) {
    throw new Error("package.json sets overrides, and the repo has no bun.lock");
  }
  return collectUnneededOverrides({
    overrides: manifest.overrides,
    catalog: manifest.catalog,
    catalogs: manifest.catalogs,
    dependents: parseLockfileDependents(lockfile)
  });
}
function readIgnoreFindings(sources, ignoreIDs) {
  return collectUnneededAuditIgnores({
    ignoreIDs,
    advisories: parseAuditAdvisories(runBun(sources, ["audit", "--json"])),
    fixablePackages: parseFixablePackages(runBun(sources, ["audit", "fix", "--dry-run", "--json"]))
  });
}
function runBun(sources, args) {
  const result = sources.runProgram(["bun", ...args], { cwd: sources.cwd, env: sources.env });
  if (result.stdout.trim() === "") {
    throw new Error(`bun ${args.join(" ")} printed nothing and exited ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

// packages/chex/src/dependency-gates/run-dependency-gates-check.ts
function runDependencyGatesCheck(check) {
  try {
    const findings = readDependencyGateFindings(check);
    for (const finding of findings) {
      check.writeOutput(`${finding.path}: ${finding.entry}: ${finding.problem}
`);
    }
    return findings.length === 0 ? 0 : 1;
  } catch (error) {
    check.writeError(`dependency-gates: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
function runDependencyGatesCommand() {
  const cwd = process.cwd();
  return runDependencyGatesCheck({
    cwd,
    env: process.env,
    today: new Date().toISOString().slice(0, 10),
    runProgram,
    readRepoFile: (path) => {
      const fullPath = join(cwd, path);
      return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : null;
    },
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    }
  });
}
if (false) {}

// packages/chex/src/make-check-runner.ts
import { join as join2 } from "path";
function makeCheckRunner(deps) {
  const makeDocsCheckRunner = (script) => (args) => deps.runScript(["bash", join2(deps.docsFolder, script), ...args]);
  const runners = {
    prose: makeDocsCheckRunner("check-prose.sh"),
    length: makeDocsCheckRunner("check-length.sh"),
    links: makeDocsCheckRunner("check-links.sh"),
    readmes: makeDocsCheckRunner("check-readmes.sh"),
    vision: makeDocsCheckRunner("check-vision.sh"),
    skill: makeDocsCheckRunner("check-skill.sh"),
    ...deps.repoChecks
  };
  return (name, args) => Promise.resolve(runners[name](args));
}

// node_modules/.bun/ts-pattern@5.9.2/node_modules/ts-pattern/dist/index.js
var t = Symbol.for("@ts-pattern/matcher");
var e = Symbol.for("@ts-pattern/isVariadic");
var n = "@ts-pattern/anonymous-select-key";
var r = (t) => Boolean(t && typeof t == "object");
var i = (e) => e && !!e[t];
var o = (n, s, c) => {
  if (i(n)) {
    const e = n[t](), { matched: r, selections: i } = e.match(s);
    return r && i && Object.keys(i).forEach((t) => c(t, i[t])), r;
  }
  if (r(n)) {
    if (!r(s))
      return false;
    if (Array.isArray(n)) {
      if (!Array.isArray(s))
        return false;
      let t = [], r = [], u = [];
      for (const o of n.keys()) {
        const s = n[o];
        i(s) && s[e] ? u.push(s) : u.length ? r.push(s) : t.push(s);
      }
      if (u.length) {
        if (u.length > 1)
          throw new Error("Pattern error: Using `...P.array(...)` several times in a single pattern is not allowed.");
        if (s.length < t.length + r.length)
          return false;
        const e = s.slice(0, t.length), n = r.length === 0 ? [] : s.slice(-r.length), i = s.slice(t.length, r.length === 0 ? Infinity : -r.length);
        return t.every((t, n) => o(t, e[n], c)) && r.every((t, e) => o(t, n[e], c)) && (u.length === 0 || o(u[0], i, c));
      }
      return n.length === s.length && n.every((t, e) => o(t, s[e], c));
    }
    return Reflect.ownKeys(n).every((e) => {
      const r = n[e];
      return ((e in s) || i(u = r) && u[t]().matcherType === "optional") && o(r, s[e], c);
      var u;
    });
  }
  return Object.is(s, n);
};
var s = (e) => {
  var n, o, u;
  return r(e) ? i(e) ? (n = (o = (u = e[t]()).getSelectionKeys) == null ? undefined : o.call(u)) != null ? n : [] : Array.isArray(e) ? c(e, s) : c(Object.values(e), s) : [];
};
var c = (t, e) => t.reduce((t, n) => t.concat(e(n)), []);
function a(t) {
  return Object.assign(t, { optional: () => h(t), and: (e) => d(t, e), or: (e) => y(t, e), select: (e) => e === undefined ? v(t) : v(e, t) });
}
function h(e) {
  return a({ [t]: () => ({ match: (t) => {
    let n = {};
    const r = (t, e) => {
      n[t] = e;
    };
    return t === undefined ? (s(e).forEach((t) => r(t, undefined)), { matched: true, selections: n }) : { matched: o(e, t, r), selections: n };
  }, getSelectionKeys: () => s(e), matcherType: "optional" }) });
}
function d(...e) {
  return a({ [t]: () => ({ match: (t) => {
    let n = {};
    const r = (t, e) => {
      n[t] = e;
    };
    return { matched: e.every((e) => o(e, t, r)), selections: n };
  }, getSelectionKeys: () => c(e, s), matcherType: "and" }) });
}
function y(...e) {
  return a({ [t]: () => ({ match: (t) => {
    let n = {};
    const r = (t, e) => {
      n[t] = e;
    };
    return c(e, s).forEach((t) => r(t, undefined)), { matched: e.some((e) => o(e, t, r)), selections: n };
  }, getSelectionKeys: () => c(e, s), matcherType: "or" }) });
}
function p(e) {
  return { [t]: () => ({ match: (t) => ({ matched: Boolean(e(t)) }) }) };
}
function v(...e) {
  const r = typeof e[0] == "string" ? e[0] : undefined, i = e.length === 2 ? e[1] : typeof e[0] == "string" ? undefined : e[0];
  return a({ [t]: () => ({ match: (t) => {
    let e = { [r != null ? r : n]: t };
    return { matched: i === undefined || o(i, t, (t, n) => {
      e[t] = n;
    }), selections: e };
  }, getSelectionKeys: () => [r != null ? r : n].concat(i === undefined ? [] : s(i)) }) });
}
function b(t) {
  return true;
}
function w(t) {
  return typeof t == "number";
}
function S(t) {
  return typeof t == "string";
}
function j(t) {
  return typeof t == "bigint";
}
var K = a(p(b));
var O = a(p(b));
var x = (t) => Object.assign(a(t), { startsWith: (e) => {
  return x(d(t, (n = e, p((t) => S(t) && t.startsWith(n)))));
  var n;
}, endsWith: (e) => {
  return x(d(t, (n = e, p((t) => S(t) && t.endsWith(n)))));
  var n;
}, minLength: (e) => x(d(t, ((t) => p((e) => S(e) && e.length >= t))(e))), length: (e) => x(d(t, ((t) => p((e) => S(e) && e.length === t))(e))), maxLength: (e) => x(d(t, ((t) => p((e) => S(e) && e.length <= t))(e))), includes: (e) => {
  return x(d(t, (n = e, p((t) => S(t) && t.includes(n)))));
  var n;
}, regex: (e) => {
  return x(d(t, (n = e, p((t) => S(t) && Boolean(t.match(n))))));
  var n;
} });
var A = x(p(S));
var N = (t) => Object.assign(a(t), { between: (e, n) => N(d(t, ((t, e) => p((n) => w(n) && t <= n && e >= n))(e, n))), lt: (e) => N(d(t, ((t) => p((e) => w(e) && e < t))(e))), gt: (e) => N(d(t, ((t) => p((e) => w(e) && e > t))(e))), lte: (e) => N(d(t, ((t) => p((e) => w(e) && e <= t))(e))), gte: (e) => N(d(t, ((t) => p((e) => w(e) && e >= t))(e))), int: () => N(d(t, p((t) => w(t) && Number.isInteger(t)))), finite: () => N(d(t, p((t) => w(t) && Number.isFinite(t)))), positive: () => N(d(t, p((t) => w(t) && t > 0))), negative: () => N(d(t, p((t) => w(t) && t < 0))) });
var P = N(p(w));
var k = (t) => Object.assign(a(t), { between: (e, n) => k(d(t, ((t, e) => p((n) => j(n) && t <= n && e >= n))(e, n))), lt: (e) => k(d(t, ((t) => p((e) => j(e) && e < t))(e))), gt: (e) => k(d(t, ((t) => p((e) => j(e) && e > t))(e))), lte: (e) => k(d(t, ((t) => p((e) => j(e) && e <= t))(e))), gte: (e) => k(d(t, ((t) => p((e) => j(e) && e >= t))(e))), positive: () => k(d(t, p((t) => j(t) && t > 0))), negative: () => k(d(t, p((t) => j(t) && t < 0))) });
var T = k(p(j));
var B = a(p(function(t) {
  return typeof t == "boolean";
}));
var _ = a(p(function(t) {
  return typeof t == "symbol";
}));
var W = a(p(function(t) {
  return t == null;
}));
var $ = a(p(function(t) {
  return t != null;
}));
class I extends Error {
  constructor(t) {
    let e;
    try {
      e = JSON.stringify(t);
    } catch (n) {
      e = t;
    }
    super(`Pattern matching error: no pattern matches value ${e}`), this.input = undefined, this.input = t;
  }
}
var L = { matched: false, value: undefined };
function M(t) {
  return new R(t, L);
}

class R {
  constructor(t, e) {
    this.input = undefined, this.state = undefined, this.input = t, this.state = e;
  }
  with(...t) {
    if (this.state.matched)
      return this;
    const e = t[t.length - 1], r = [t[0]];
    let i;
    t.length === 3 && typeof t[1] == "function" ? i = t[1] : t.length > 2 && r.push(...t.slice(1, t.length - 1));
    let s = false, c = {};
    const u = (t, e) => {
      s = true, c[t] = e;
    }, a = !r.some((t) => o(t, this.input, u)) || i && !Boolean(i(this.input)) ? L : { matched: true, value: e(s ? n in c ? c[n] : c : this.input, this.input) };
    return new R(this.input, a);
  }
  when(t, e) {
    if (this.state.matched)
      return this;
    const n = Boolean(t(this.input));
    return new R(this.input, n ? { matched: true, value: e(this.input, this.input) } : L);
  }
  otherwise(t) {
    return this.state.matched ? this.state.value : t(this.input);
  }
  exhaustive(t = F) {
    return this.state.matched ? this.state.value : t(this.input);
  }
  run() {
    return this.exhaustive();
  }
  returnType() {
    return this;
  }
  narrow() {
    return this;
  }
}
function F(t) {
  throw new I(t);
}

// packages/chex/src/parse-chex-args.ts
import { parseArgs } from "util";

// packages/chex/src/check-names.ts
var docsCheckNames = ["prose", "length", "links", "readmes", "vision", "skill"];
var checkNames = [
  ...docsCheckNames,
  "commits",
  "local-paths",
  "test-timeouts",
  "workflows",
  "dependency-gates",
  "uncommitted"
];
function isCheckName(value) {
  return checkNames.some((name) => name === value);
}

// packages/chex/src/parse-chex-args.ts
var checksWithArgs = new Set([
  "prose",
  "links",
  "skill",
  "commits",
  "local-paths",
  "workflows"
]);
var chexUsage = `usage: chex <check>... | chex <check> [args...] | chex init
checks: ${checkNames.join(", ")}`;
function parseChexArgs(argv) {
  const [first, ...rest] = argv;
  if (first === undefined) {
    return { kind: "refused", message: "name a check to run" };
  }
  if (first === "init") {
    return rest.length === 0 ? { kind: "init" } : { kind: "refused", message: "init takes no arguments" };
  }
  const tokens = parseArgs({
    args: [...argv],
    strict: false,
    allowPositionals: true,
    tokens: true
  }).tokens;
  const firstArg = tokens.find((token) => token.kind !== "positional" || !isCheckName(token.value));
  const names = (firstArg === undefined ? argv : argv.slice(0, firstArg.index)).filter((word) => isCheckName(word));
  const args = firstArg === undefined ? [] : argv.slice(firstArg.index);
  const [only, ...others] = names;
  if (only === undefined) {
    return { kind: "refused", message: `unknown check "${first}"` };
  }
  if (args.length === 0) {
    return { kind: "checks", names: [...new Set(names)], args };
  }
  if (others.length > 0) {
    return {
      kind: "refused",
      message: `"${args[0]}" is no check name; arguments follow one check name alone`
    };
  }
  if (!checksWithArgs.has(only)) {
    return { kind: "refused", message: `${only} takes no arguments, and got "${args[0]}"` };
  }
  return { kind: "checks", names, args };
}

// packages/chex/src/run-chex.ts
function runChex(argv, deps) {
  return M(parseChexArgs(argv)).with({ kind: "refused" }, (refusal) => {
    deps.writeError(`chex: ${refusal.message}
${chexUsage}
`);
    return Promise.resolve(2);
  }).with({ kind: "init" }, () => deps.runInit()).with({ kind: "checks" }, (request) => runChecks(request.names, request.args, deps)).exhaustive();
}
async function runChecks(names, args, deps) {
  let exitCode = 0;
  for (const name of names) {
    const checkExitCode = await runOneCheck(name, args, deps);
    deps.writeOutput(`${checkExitCode === 0 ? "cleared" : "bounced"}: ${name}
`);
    exitCode = Math.max(exitCode, checkExitCode);
  }
  return exitCode;
}
async function runOneCheck(name, args, deps) {
  try {
    const exitCode = await deps.runCheck(name, args);
    return exitCode === 0 || exitCode === 1 ? exitCode : 2;
  } catch (error) {
    deps.writeError(`chex: ${name} cannot run: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}

// packages/chex/src/run-commits-check.ts
import { dirname, join as join3 } from "path";

// packages/chex/src/format-commit-lines.ts
function formatCommitLines(commits) {
  return commits.map((commit) => `${commit}
`).join("");
}

// packages/chex/src/parse-pushed-refs.ts
var zeroSha = /^0+$/u;
function parsePushedRefs(text) {
  return text.split(`
`).filter((line) => line.trim() !== "").flatMap((line) => {
    const [, localSha, , remoteSha] = line.trim().split(" ");
    if (localSha === undefined || remoteSha === undefined) {
      throw new Error(`cannot read the pushed ref line: ${line}`);
    }
    if (zeroSha.test(localSha)) {
      return [];
    }
    return [{ localSha, remoteSha: zeroSha.test(remoteSha) ? null : remoteSha }];
  });
}

// packages/chex/src/read-branch-base.ts
function readBranchBase(options) {
  const defaultBranch = readDefaultBranch(options);
  const base = runGit(options, ["merge-base", "HEAD", defaultBranch]);
  if (base.exitCode !== 0) {
    throw new Error(`cannot find the base of this branch: no merge base between HEAD and ${defaultBranch} (is the remote fetched?)`);
  }
  return base.stdout.trim();
}
function readDefaultBranch(options) {
  const head = runGit(options, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  return head.exitCode === 0 ? head.stdout.trim() : "origin/main";
}
function runGit(options, args) {
  return options.runProgram(["git", ...args], { cwd: options.cwd, env: options.env });
}

// packages/chex/src/read-pushed-ranges.ts
function readPushedRanges(options) {
  if (options.pushedRefs === null) {
    const base = readBranchBase(options);
    return [[`${base}..HEAD`]];
  }
  const refs = parsePushedRefs(options.pushedRefs);
  if (refs.length === 0) {
    return [];
  }
  const defaultBranch = readDefaultBranch(options);
  if (!probeCommitPresent(options, defaultBranch)) {
    throw new Error(`cannot find origin's default branch: ${defaultBranch} is not a commit (is the remote fetched?)`);
  }
  return refs.map((ref) => ref.remoteSha !== null && probeCommitPresent(options, ref.remoteSha) ? [ref.localSha, `^${defaultBranch}`, `^${ref.remoteSha}`] : [ref.localSha, `^${defaultBranch}`]);
}
function probeCommitPresent(options, revision) {
  const result = options.runProgram(["git", "cat-file", "-e", `${revision}^{commit}`], {
    cwd: options.cwd,
    env: options.env
  });
  return result.exitCode === 0;
}

// packages/chex/src/read-pushed-refs-input.ts
import { parseArgs as parseArgs2 } from "util";
function readPushedRefsInput(args, readStdin) {
  const parsed = parseArgs2({
    args: [...args],
    options: { "pushed-refs": { type: "boolean" } },
    strict: true
  });
  return parsed.values["pushed-refs"] === true ? readStdin() : Promise.resolve(null);
}

// packages/chex/src/read-range-commits.ts
function readRangeCommits(options, ranges) {
  const commits = ranges.flatMap((range) => {
    const argv = ["git", "rev-list", ...range];
    const result = options.runProgram(argv, { cwd: options.cwd, env: options.env });
    if (result.exitCode !== 0) {
      throw new Error(`${argv.join(" ")} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.split(`
`).filter((line) => line !== "");
  });
  return [...new Set(commits)];
}

// packages/chex/src/run-commits-check.ts
function runCommitsCheck(options) {
  return readBranchCommits(options).flatMap((commit) => {
    const result = options.runProgram([options.commitlint, "--config", options.config, "--color=false"], { cwd: options.cwd, env: options.env, stdin: commit.message });
    return parseCommitlintOutput(commit.hash, result);
  });
}
function readBranchCommits(options) {
  const commits = readRangeCommits(options, options.ranges);
  if (commits.length === 0) {
    return [];
  }
  const result = options.runProgram(["git", "log", "--no-merges", "-z", "--format=%h%n%B", "--no-walk=unsorted", "--stdin"], { cwd: options.cwd, env: options.env, stdin: formatCommitLines(commits) });
  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\x00").filter((entry) => entry !== "").map((entry) => {
    const newline = entry.indexOf(`
`);
    return { hash: entry.slice(0, newline), message: entry.slice(newline + 1) };
  });
}
function parseCommitlintOutput(hash, result) {
  const problemLine = /^\u2716\s+(?<message>.+ \[[\w-]+\])$/u;
  if (result.exitCode > 1) {
    throw new Error(`commitlint failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  const problems = result.stdout.split(`
`).flatMap((line) => {
    const message = problemLine.exec(line)?.groups?.["message"];
    return message === undefined ? [] : [`commit ${hash}: ${message}`];
  });
  if (result.exitCode === 1 && problems.length === 0) {
    throw new Error(`commitlint failed: ${result.stderr.trim()}`);
  }
  return problems;
}
async function runCommitsCommand(args) {
  const cwd = process.cwd();
  const commitlint = Bun.which("commitlint", {
    PATH: `${join3(cwd, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`
  });
  if (commitlint === null) {
    writeSkipNotice("the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it");
    return 0;
  }
  if (!await probeConfigInstalled(cwd)) {
    writeSkipNotice("the repo does not install @zgeoff/commitlint-config; add it as a devDependency to run it");
    return 0;
  }
  try {
    const config = Bun.resolveSync("@zgeoff/commitlint-config", cwd);
    const ranges = readPushedRanges({
      cwd,
      env: process.env,
      pushedRefs: await readPushedRefsInput(args, () => Bun.stdin.text()),
      runProgram
    });
    const problems = runCommitsCheck({
      cwd,
      ranges,
      env: process.env,
      commitlint,
      config,
      runProgram
    });
    for (const problem of problems) {
      process.stdout.write(`${problem}
`);
    }
    return problems.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`commits: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
async function probeConfigInstalled(cwd) {
  const found = await Promise.all(collectAncestorFolders(cwd).map((folder) => Bun.file(join3(folder, "node_modules/@zgeoff/commitlint-config/package.json")).exists()));
  return found.includes(true);
}
function collectAncestorFolders(folder) {
  const parent = dirname(folder);
  return parent === folder ? [folder] : [folder, ...collectAncestorFolders(parent)];
}
function writeSkipNotice(reason) {
  const prefix = process.env["GITHUB_ACTIONS"] === "true" ? "::notice::" : "";
  process.stdout.write(`${prefix}commits: skipped, because ${reason}
`);
}
if (false) {}

// packages/chex/src/run-init.ts
import { join as join4 } from "path";

// packages/chex/src/build-init-package.ts
var baselinePackages = ["@zgeoff/chex", "@zgeoff/rig", "@zgeoff/diet"];
var docsScript = "chex prose length links skill";
function buildInitPackage(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      kind: "refused",
      reason: `package.json is not JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (!isRecord(parsed)) {
    return { kind: "refused", reason: "package.json is not a JSON object" };
  }
  const installed = new Set([
    ...listKeys(parsed["dependencies"]),
    ...listKeys(parsed["devDependencies"])
  ]);
  const missing = baselinePackages.filter((name) => !installed.has(name));
  if (missing.length > 0) {
    return { kind: "missing", packages: missing };
  }
  const scripts = parsed["scripts"] ?? {};
  if (!isRecord(scripts)) {
    return { kind: "refused", reason: "the scripts of package.json are not a JSON object" };
  }
  if (scripts["check:docs"] !== undefined) {
    return { kind: "unchanged" };
  }
  const edited = { ...parsed, scripts: { ...scripts, "check:docs": docsScript } };
  return { kind: "changed", text: `${JSON.stringify(edited, null, 2)}
` };
}
function listKeys(value) {
  return isRecord(value) ? Object.keys(value) : [];
}

// packages/chex/src/parse-lefthook-config.ts
function parseLefthookConfig(text) {
  let parsed;
  try {
    parsed = Bun.YAML.parse(text);
  } catch {
    return;
  }
  if (parsed === null) {
    return {};
  }
  return isRecord(parsed) ? parsed : undefined;
}

// packages/chex/src/build-lefthook-extends.ts
var baselinePath = "node_modules/@zgeoff/chex/lefthook.yml";
var extendsLine = /^extends:[ \t]*(?:#.*)?$/mu;
var inlineExtends = /^(?<open>extends:[ \t]*\[)(?<items>[^\]\n]*)(?<close>\][ \t]*(?:#.*)?)$/mu;
function buildLefthookExtends(text) {
  if (text === undefined) {
    return { kind: "changed", text: `extends:
  - ${baselinePath}
` };
  }
  const config = parseLefthookConfig(text);
  if (config === undefined) {
    return { kind: "refused", reason: "lefthook.yml is not a YAML mapping" };
  }
  const extended = config["extends"];
  if (extended === undefined) {
    return checkEdit(config, buildFirstExtends(text));
  }
  if (Array.isArray(extended) && extended.includes(baselinePath)) {
    return { kind: "unchanged", text };
  }
  const inline = inlineExtends.exec(text);
  if (Array.isArray(extended) && inline !== null) {
    return checkEdit(config, buildInlineExtends(text, inline));
  }
  const match = extendsLine.exec(text);
  if (!Array.isArray(extended) || match === null) {
    return {
      kind: "refused",
      reason: `lefthook.yml writes extends in a form chex init does not edit; add ${baselinePath} to its list`
    };
  }
  const end = match.index + match[0].length;
  return checkEdit(config, `${text.slice(0, end)}
  - ${baselinePath}${text.slice(end)}`);
}
function checkEdit(config, edited) {
  const editedConfig = parseLefthookConfig(edited);
  if (editedConfig !== undefined) {
    const { extends: editedExtends, ...editedRest } = editedConfig;
    const { extends: _, ...rest } = config;
    if (Array.isArray(editedExtends) && editedExtends.includes(baselinePath) && Bun.deepEquals(editedRest, rest, true)) {
      return { kind: "changed", text: edited };
    }
  }
  return {
    kind: "refused",
    reason: `lefthook.yml is laid out in a form chex init does not edit; add an extends list that names ${baselinePath}`
  };
}
var documentStart = /^(?:[ \t]*(?:#.*)?\n)*---[ \t]*(?:#.*)?(?=\n|$)/u;
function buildFirstExtends(text) {
  const start = documentStart.exec(text);
  if (start === null) {
    return `extends:
  - ${baselinePath}

${text}`;
  }
  const end = start[0].length;
  return `${text.slice(0, end)}
extends:
  - ${baselinePath}
${text.slice(end)}`;
}
function buildInlineExtends(text, inline) {
  const groups = inline.groups ?? {};
  const items = groups["items"] ?? "";
  const listed = items.trim() === "" ? baselinePath : `${items.trimEnd()}, ${baselinePath}`;
  const end = inline.index + inline[0].length;
  return `${text.slice(0, inline.index)}${groups["open"] ?? ""}${listed}${groups["close"] ?? ""}${text.slice(end)}`;
}

// packages/chex/src/build-lefthook-guard.ts
var guardedHooks = ["pre-commit", "pre-push"];
function buildLefthookGuard(text) {
  let edited = text;
  for (const hook of guardedHooks) {
    const edit = buildHookEdit(edited, hook);
    if (edit.kind === "refused") {
      return edit;
    }
    edited = edit.text;
  }
  return edited === text ? { kind: "unchanged", text } : { kind: "changed", text: edited };
}
var guardName = "chex-baseline";
var guardScript = [
  `if [ ! -f ${baselinePath} ]; then`,
  `  echo "${guardName}: ${baselinePath} is missing, so lefthook runs none of the chex baseline's jobs; run bun install, then try again"`,
  "  exit 1",
  "fi",
  "# {files}"
];
var guardFiles = "echo package.json";
var guardJob = { name: guardName, files: guardFiles, run: `${guardScript.join(`
`)}
` };
function buildHookEdit(text, hook) {
  const config = parseLefthookConfig(text);
  if (config === undefined) {
    return { kind: "refused", reason: "lefthook.yml is not a YAML mapping" };
  }
  const hookConfig = config[hook];
  if (hookConfig === undefined) {
    const separator = text.endsWith(`
`) ? "" : `
`;
    return checkHookEdit(config, hook, { jobs: [guardJob] }, `${text}${separator}
${hook}:
  jobs:
${formatGuardJob("    ")}`);
  }
  const listedJobs = isRecord(hookConfig) ? hookConfig["jobs"] : undefined;
  if (!isRecord(hookConfig) || !Array.isArray(listedJobs)) {
    return refuseHook(hook);
  }
  const jobs = listedJobs;
  const listed = jobs.find((job) => isRecord(job) && job["name"] === guardName);
  if (listed !== undefined) {
    return Bun.deepEquals(listed, guardJob, true) ? { kind: "guarded", text } : {
      kind: "refused",
      reason: `lefthook.yml has a ${guardName} job under ${hook} that differs from the one chex init writes; remove it, then run chex init again`
    };
  }
  const insert = findGuardInsert(text, hook);
  if (insert === undefined) {
    return refuseHook(hook);
  }
  return checkHookEdit(config, hook, { ...hookConfig, jobs: [guardJob, ...jobs] }, `${text.slice(0, insert.offset)}${formatGuardJob(insert.indent)}${text.slice(insert.offset)}`);
}
function checkHookEdit(config, hook, hookConfig, edited) {
  const editedConfig = parseLefthookConfig(edited);
  if (editedConfig !== undefined && Bun.deepEquals(editedConfig, { ...config, [hook]: hookConfig }, true)) {
    return { kind: "guarded", text: edited };
  }
  return refuseHook(hook);
}
function refuseHook(hook) {
  return {
    kind: "refused",
    reason: `lefthook.yml writes ${hook} in a form chex init does not edit; write its ${hook} jobs as a block list, then run chex init again`
  };
}
function formatGuardJob(indent) {
  const lines = [
    `- name: ${guardName}`,
    `  files: ${guardFiles}`,
    "  run: |",
    ...guardScript.map((line) => `    ${line}`)
  ];
  return lines.map((line) => `${indent}${line}
`).join("");
}
function findGuardInsert(text, hook) {
  const hookLine = new RegExp(`^${hook}:[ \\t]*(?:#.*)?$`, "mu").exec(text);
  if (hookLine === null) {
    return;
  }
  const blockStart = hookLine.index + hookLine[0].length;
  const blockEnd = /^[^\s#]/mu.exec(text.slice(blockStart + 1));
  const blockStop = blockEnd === null ? text.length : blockStart + 1 + blockEnd.index;
  const block = text.slice(blockStart, blockStop);
  const jobsLine = /^[ \t]+jobs:[ \t]*(?:#.*)?$/mu.exec(block);
  if (jobsLine === null) {
    return;
  }
  const afterJobs = jobsLine.index + jobsLine[0].length;
  const item = /^(?<indent>[ \t]*)- /mu.exec(block.slice(afterJobs));
  if (item === null) {
    return;
  }
  return { offset: blockStart + afterJobs + 1, indent: item.groups?.["indent"] ?? "" };
}

// packages/chex/src/build-init-plan.ts
function buildInitPlan(packageText, lefthookText) {
  if (packageText === undefined) {
    return {
      kind: "refused",
      reasons: ["the folder has no package.json; run chex init from the repo root"]
    };
  }
  return M(buildInitPackage(packageText)).with({ kind: "missing" }, (outcome) => ({
    kind: "refused",
    reasons: [
      `the baseline needs ${outcome.packages.join(", ")} installed; run bun add -d ${outcome.packages.join(" ")}`
    ]
  })).with({ kind: "unchanged" }, () => buildPlanFromSteps([buildLefthookStep(lefthookText)])).with({ kind: "changed" }, (outcome) => buildPlanFromSteps([
    buildLefthookStep(lefthookText),
    {
      reasons: [],
      writes: [{ file: "package.json", text: outcome.text }],
      notes: [`package.json runs "${docsScript}" as check:docs`]
    }
  ])).with({ kind: "refused" }, (outcome) => buildPlanFromSteps([
    buildLefthookStep(lefthookText),
    { reasons: [outcome.reason], writes: [], notes: [] }
  ])).exhaustive();
}
function buildPlanFromSteps(steps) {
  const reasons = steps.flatMap((step) => step.reasons);
  if (reasons.length > 0) {
    return { kind: "refused", reasons };
  }
  const writes = steps.flatMap((step) => step.writes);
  return {
    kind: "apply",
    writes,
    notes: writes.length === 0 ? ["the repo already takes the baseline; nothing to change"] : steps.flatMap((step) => step.notes)
  };
}
function buildLefthookStep(lefthookText) {
  return M(buildLefthookExtends(lefthookText)).with({ kind: "unchanged" }, (outcome) => buildGuardStep(outcome.text, [])).with({ kind: "changed" }, (outcome) => buildGuardStep(outcome.text, [`lefthook.yml extends ${baselinePath}`])).with({ kind: "refused" }, (outcome) => ({ reasons: [outcome.reason], writes: [], notes: [] })).exhaustive();
}
var keptStep = { reasons: [], writes: [], notes: [] };
function buildGuardStep(text, notes) {
  return M(buildLefthookGuard(text)).with({ kind: "unchanged" }, () => notes.length === 0 ? keptStep : { reasons: [], writes: [{ file: "lefthook.yml", text }], notes }).with({ kind: "changed" }, (outcome) => ({
    reasons: [],
    writes: [{ file: "lefthook.yml", text: outcome.text }],
    notes: [
      ...notes,
      `lefthook.yml runs ${guardName} first in ${guardedHooks.join(" and ")}, which fails when ${baselinePath} is missing`
    ]
  })).with({ kind: "refused" }, (outcome) => ({ reasons: [outcome.reason], writes: [], notes: [] })).exhaustive();
}

// packages/chex/src/run-init.ts
async function runInit(deps) {
  const packageText = await deps.readText(join4(deps.repoRoot, "package.json"));
  const lefthookText = await deps.readText(join4(deps.repoRoot, "lefthook.yml"));
  const plan = buildInitPlan(packageText, lefthookText);
  return M(plan).with({ kind: "refused" }, (refusal) => {
    deps.writeError(refusal.reasons.map((reason) => `chex init: ${reason}
`).join(""));
    return Promise.resolve(1);
  }).with({ kind: "apply" }, async (apply) => {
    const originals = { "package.json": packageText, "lefthook.yml": lefthookText };
    const failure = await writeInitFiles(apply.writes, originals, deps);
    if (failure !== null) {
      deps.writeError(`chex init: ${failure}, so both files stay as they were
`);
      return 1;
    }
    deps.writeOutput(apply.notes.map((note) => `chex init: ${note}
`).join(""));
    return 0;
  }).exhaustive();
}
async function writeInitFiles(writes, originals, deps) {
  const staged = [];
  for (const write of writes) {
    const failure = await settleEffect(deps.writeText(toStagedPath(deps, write.file), write.text));
    if (failure !== null) {
      await removeStagedFiles([...staged, write], deps);
      return `could not write ${write.file}: ${failure}`;
    }
    staged.push(write);
  }
  const replaced = [];
  for (const write of staged) {
    const failure = await settleEffect(deps.renameFile(toStagedPath(deps, write.file), join4(deps.repoRoot, write.file)));
    if (failure !== null) {
      await removeStagedFiles(staged.slice(replaced.length), deps);
      await restoreFiles(replaced, originals, deps);
      return `could not replace ${write.file}: ${failure}`;
    }
    replaced.push(write);
  }
  return null;
}
async function settleEffect(effect) {
  try {
    await effect;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
function toStagedPath(deps, file) {
  return join4(deps.repoRoot, `${file}.chex-init`);
}
async function removeStagedFiles(writes, deps) {
  await Promise.allSettled(writes.map((write) => deps.removeFile(toStagedPath(deps, write.file))));
}
async function restoreFiles(replaced, originals, deps) {
  for (const write of replaced) {
    const path = join4(deps.repoRoot, write.file);
    const original = originals[write.file];
    await (original === undefined ? deps.removeFile(path) : deps.writeText(path, original));
  }
}

// packages/chex/src/run-local-paths-check.ts
import { hostname } from "os";

// packages/chex/src/parse-added-lines.ts
function parseAddedLines(patch) {
  const hunkHeader = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;
  const added = [];
  let hash = "";
  let path = null;
  let line = 0;
  let inHeader = false;
  for (const text of patch.split(`
`)) {
    if (text.startsWith("\x00")) {
      hash = text.slice(1);
      path = null;
      inHeader = false;
    } else if (text.startsWith("diff --git ")) {
      path = null;
      inHeader = true;
    } else if (inHeader && text.startsWith("+++ ")) {
      path = parseNewPath(text.slice("+++ ".length));
    } else if (hunkHeader.test(text)) {
      line = Number(hunkHeader.exec(text)?.groups?.["start"]);
      inHeader = false;
    } else if (!inHeader && path !== null && text.startsWith("+")) {
      added.push({ hash, path, line, text: text.slice(1) });
      line += 1;
    } else if (!inHeader && path !== null && text.startsWith(" ")) {
      line += 1;
    }
  }
  return added;
}
function parseNewPath(name) {
  const bare = name.replace(/\t$/u, "");
  if (bare === "/dev/null") {
    return null;
  }
  const unquoted = bare.startsWith('"') && bare.endsWith('"') ? parseQuotedName(bare.slice(1, -1)) : bare;
  return unquoted.replace(/^b\//u, "");
}
var ESCAPED_BYTES = new Map([
  ["a", 7],
  ["b", 8],
  ["t", 9],
  ["n", 10],
  ["v", 11],
  ["f", 12],
  ["r", 13],
  ['"', 34],
  ["\\", 92]
]);
function parseQuotedName(quoted) {
  const bytes = [];
  const encoder = new TextEncoder;
  for (let index = 0;index < quoted.length; index += 1) {
    const character = String.fromCodePoint(quoted.codePointAt(index) ?? 0);
    if (character !== "\\") {
      bytes.push(...encoder.encode(character));
      index += character.length - 1;
      continue;
    }
    const next = quoted.charAt(index + 1);
    const octal = /^[0-7]{3}/u.exec(quoted.slice(index + 1))?.[0];
    if (octal === undefined) {
      bytes.push(ESCAPED_BYTES.get(next) ?? next.codePointAt(0) ?? 92);
      index += 1;
    } else {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// packages/chex/src/pick-merge-blobs-command.ts
function pickMergeBlobsCommand(readings) {
  if (readings.promisor === undefined) {
    return {
      reading: "promisor",
      argv: ["git", "config", "--type=bool", "--get", "remote.origin.promisor"],
      exitCodes: "any"
    };
  }
  if (readings.promisor.trim() !== "true") {
    return null;
  }
  if (readings.merges === undefined) {
    return {
      reading: "merges",
      argv: ["git", "rev-list", "--merges", "--parents", "--no-walk=unsorted", "--stdin"],
      stdin: formatCommitLines(readings.commits),
      exitCodes: [0]
    };
  }
  const merges = splitLines(readings.merges).map((line) => line.split(" "));
  const pending = merges[readings.bases.length];
  if (pending !== undefined) {
    return {
      reading: "bases",
      argv: ["git", "merge-base", "--all", ...pending.slice(1)],
      exitCodes: [0, 1]
    };
  }
  const pairs = merges.flatMap((mergeAndParents, index) => splitLines(readings.bases[index] ?? "").flatMap((base) => mergeAndParents.map((commit) => `${base} ${commit}
`)));
  if (pairs.length === 0) {
    return null;
  }
  if (readings.listing === undefined) {
    const pairCommits = new Set(pairs.flatMap((pair) => pair.trim().split(" ")));
    return {
      reading: "listing",
      argv: ["git", "rev-list", "--objects", "--missing=print", "--no-walk", "--stdin"],
      stdin: formatCommitLines([...pairCommits]),
      exitCodes: [0]
    };
  }
  if (readings.diff === undefined) {
    return {
      reading: "diff",
      argv: ["git", "diff-tree", "-r", "--no-abbrev", "--stdin"],
      stdin: pairs.join(""),
      exitCodes: [0]
    };
  }
  const missing = new Set(splitLines(readings.listing).filter((line) => line.startsWith("?")).map((line) => line.slice(1)));
  const blobs = collectBlobIDs(readings.diff).filter((blob) => missing.has(blob));
  if (blobs.length === 0 || readings.fetch !== undefined) {
    return null;
  }
  return {
    reading: "fetch",
    argv: [
      "git",
      "-c",
      "fetch.negotiationAlgorithm=noop",
      "fetch",
      "--quiet",
      "--no-tags",
      "--no-write-fetch-head",
      "--filter=blob:none",
      "--stdin",
      "origin"
    ],
    stdin: blobs.map((blob) => `${blob}
`).join(""),
    exitCodes: [0]
  };
}
function splitLines(text) {
  return text.split(`
`).filter((line) => line !== "");
}
var blobModes = new Set(["100644", "100755", "120000"]);
function collectBlobIDs(rawDiff) {
  const blobs = new Set;
  for (const line of rawDiff.split(`
`)) {
    if (!line.startsWith(":")) {
      continue;
    }
    const [oldMode, newMode, oldBlob, newBlob] = line.slice(1).split(" ");
    for (const [mode, blob] of [
      [oldMode, oldBlob],
      [newMode, newBlob]
    ]) {
      if (mode !== undefined && blob !== undefined && blobModes.has(mode)) {
        blobs.add(blob);
      }
    }
  }
  return [...blobs];
}

// packages/chex/src/run-local-paths-check.ts
function runLocalPathsCheck(options) {
  const home = findHomePrefix(options.env["HOME"]);
  const host = findHostPattern(options.host);
  if (home === null && host === null) {
    return [];
  }
  const commits = readRangeCommits(options, options.ranges);
  if (commits.length === 0) {
    return [];
  }
  runMergeBlobsFetch(options, commits);
  const result = options.runProgram([
    "git",
    "-c",
    "core.quotePath=false",
    "log",
    "-p",
    "-U0",
    "-M",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--diff-merges=remerge",
    "--format=%x00%h",
    "--no-walk=unsorted",
    "--stdin"
  ], { cwd: options.cwd, env: options.env, stdin: formatCommitLines(commits) });
  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }
  return parseAddedLines(result.stdout).flatMap((added) => {
    const findings = [];
    if (home !== null && added.text.includes(home)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the home directory ${home}; remove it before you push`
      });
    }
    if (host !== null && host.pattern.test(added.text)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the host name ${host.name}; remove it before you push`
      });
    }
    return findings;
  });
}
function findHomePrefix(home) {
  const trimmed = home?.replace(/\/+$/u, "") ?? "";
  return trimmed === "" ? null : `${trimmed}/`;
}
function findHostPattern(name) {
  if (name === "" || name === "localhost") {
    return null;
  }
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return { name, pattern: new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "u") };
}
function runMergeBlobsFetch(options, commits) {
  let readings = { commits, bases: [] };
  for (let command = pickMergeBlobsCommand(readings);command !== null; command = pickMergeBlobsCommand(readings)) {
    const result = options.runProgram(command.argv, {
      cwd: options.cwd,
      env: options.env,
      ...command.stdin === undefined ? {} : { stdin: command.stdin }
    });
    if (command.exitCodes !== "any" && !command.exitCodes.includes(result.exitCode)) {
      throw new Error(`${command.argv.join(" ")} failed: ${result.stderr.trim()}`);
    }
    readings = command.reading === "bases" ? { ...readings, bases: [...readings.bases, result.stdout] } : { ...readings, [command.reading]: result.stdout };
  }
}
async function runLocalPathsCommand(args) {
  try {
    const ranges = readPushedRanges({
      cwd: process.cwd(),
      env: process.env,
      pushedRefs: await readPushedRefsInput(args, () => Bun.stdin.text()),
      runProgram
    });
    const findings = runLocalPathsCheck({
      cwd: process.cwd(),
      ranges,
      env: process.env,
      host: hostname(),
      runProgram
    });
    for (const finding of findings) {
      process.stdout.write(`${finding.path}:${finding.line}: ${finding.message}
`);
    }
    return findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`local-paths: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
if (false) {}

// packages/chex/src/run-test-timeouts-check.ts
import { basename, dirname as dirname2, posix } from "path";

// packages/chex/src/parse-lane-limits.ts
var standardLaneLimits = [
  ["browser", 1e4],
  ["e2e", 15000],
  ["docker", 15000],
  ["host", 15000],
  ["agent-sdk", 5000],
  ["model-api", 120000]
];
var listedLaneLimitMs = 15000;
function parseLaneLimits(configText) {
  const limits = new Map(standardLaneLimits);
  const lanes = configText === null ? undefined : parseLanesOption(configText);
  if (Array.isArray(lanes)) {
    for (const lane of lanes) {
      if (typeof lane === "string" && !limits.has(lane)) {
        limits.set(lane, listedLaneLimitMs);
      }
    }
  } else if (typeof lanes === "object" && lanes !== null) {
    for (const [lane, limitMs] of Object.entries(lanes)) {
      if (typeof limitMs === "number") {
        limits.set(lane, limitMs);
      }
    }
  }
  return limits;
}
function parseLanesOption(text) {
  const config = parseConfig(text);
  const setting = findMember(findMember(config, "rules"), "zgeoff/max-test-timeout");
  const ruleOptions = Array.isArray(setting) ? setting[1] : undefined;
  return findMember(ruleOptions, "lanes");
}
function parseConfig(text) {
  try {
    return Bun.JSONC.parse(text);
  } catch (error) {
    throw new Error(`cannot parse .oxlintrc.json: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
function findMember(value, key) {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

// packages/chex/src/run-test-timeouts-check.ts
function runTestTimeoutsCheck(options) {
  const paths = runGit2(options, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\x00");
  const configText = paths.includes(oxlintConfigPath) ? runGit2(options, ["show", `HEAD:${oxlintConfigPath}`]) : null;
  const limits = parseLaneLimits(configText);
  const appRoots = new Set(paths.filter((path) => basename(path) === "package.json").map((path) => dirname2(path)));
  return paths.filter((path) => checkedFiles.has(basename(path)) || configPattern.test(basename(path))).flatMap((path) => {
    const text = runGit2(options, ["show", `HEAD:${path}`]);
    if (configPattern.test(basename(path))) {
      return collectConfigFindings(path, text);
    }
    return basename(path) === "package.json" ? collectScriptFindings(path, text, limits) : collectBunfigFindings(path, text, pickLaneLimit(limits, findDirectoryLane(path, appRoots)));
  });
}
var configPattern = /^\.?oxlintrc(?:\.[\w-]+)?\.jsonc?$/u;
var oxlintConfigPath = ".oxlintrc.json";
var checkedFiles = new Set(["package.json", "bunfig.toml"]);
function runGit2(options, args) {
  const result = options.runProgram(["git", ...args], { cwd: options.cwd, env: options.env });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
function collectConfigFindings(path, text) {
  const tokens = parseJSONCTokens(path, text);
  const values = tokens.filter((token) => token.kind !== "comment");
  const comments = tokens.filter((token) => token.kind === "comment");
  const valueLines = new Set(values.map((token) => token.line));
  const overrides = collectOverrideLines(values);
  return values.flatMap((token, index) => {
    const rule = token.kind === "string" ? guardedRules.find((name) => name === token.text) : undefined;
    if (rule === undefined || values[index + 1]?.text !== ":") {
      return [];
    }
    const first = values[index + 2];
    const severity = first?.text === "[" ? values[index + 3] : first;
    if (severity === undefined || !weakSeverities.has(severity.text)) {
      return [];
    }
    const override = overrides.get(index);
    const notes = comments.filter((comment) => comment.line >= token.line && comment.line <= severity.line || isCommentAbove(comment, token.line, valueLines) || override !== undefined && (comment.line === override || isCommentAbove(comment, override, valueLines)));
    if (notes.some((comment) => ticketPattern.test(comment.text) || floorPattern.test(comment.text))) {
      return [];
    }
    return [
      {
        path,
        message: `line ${token.line} turns ${rule} off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes`
      }
    ];
  });
}
var weakSeverities = new Set(["off", "warn", "allow", "0", "1"]);
function parseJSONCTokens(path, text) {
  const tokens = [];
  let line = 1;
  let index = 0;
  const advance = (end) => {
    const start = line;
    for (let at = index;at < end; at += 1) {
      if (text.charAt(at) === `
`) {
        line += 1;
      }
    }
    index = end;
    return start;
  };
  while (index < text.length) {
    const character = text.charAt(index);
    const next = text.charAt(index + 1);
    if (/\s/u.test(character)) {
      advance(index + 1);
    } else if (character === "/" && (next === "/" || next === "*")) {
      const close = next === "/" ? text.indexOf(`
`, index) : text.indexOf("*/", index + 2);
      const end = close === -1 ? text.length : close;
      const body = text.slice(index + 2, end);
      const after = next === "/" || close === -1 ? end : end + 2;
      const start = advance(after);
      tokens.push({ kind: "comment", text: body, line: start, endLine: line });
    } else if (character === '"') {
      const end = getStringEnd(path, text, index);
      const body = parseText(path, text.slice(index, end), (input) => JSON.parse(input));
      const start = advance(end);
      tokens.push({ kind: "string", text: String(body), line: start, endLine: line });
    } else {
      const word = /^[\w.+-]+/u.exec(text.slice(index))?.[0] ?? character;
      const start = advance(index + word.length);
      tokens.push({ kind: "other", text: word, line: start, endLine: line });
    }
  }
  return tokens;
}
function getStringEnd(path, text, start) {
  for (let index = start + 1;index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character === "\\") {
      index += 1;
    } else if (character === '"') {
      return index + 1;
    }
  }
  throw new Error(`cannot parse ${path}: a string never closes`);
}
function parseText(path, text, parse) {
  try {
    return parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
function collectOverrideLines(values) {
  const lines = new Map;
  const open = [];
  for (const [index, token] of values.entries()) {
    if (token.text === "{") {
      open.push(index);
    } else if (token.text === "}") {
      open.pop();
    }
    const override = open.length >= 3 ? values[open[1] ?? 0] : undefined;
    if (override !== undefined) {
      lines.set(index, override.line);
    }
  }
  return lines;
}
function isCommentAbove(comment, line, valueLines) {
  if (comment.endLine >= line) {
    return false;
  }
  for (let between = comment.endLine + 1;between < line; between += 1) {
    if (valueLines.has(between)) {
      return false;
    }
  }
  return !valueLines.has(comment.line);
}
var unitLimitMs = 5000;
var slowTestsHint = 'find its cause in the "Slow tests" section of the testing skill and fix it';
function collectScriptFindings(path, text, limits) {
  const scripts = findMember2(parseText(path, text, (input) => JSON.parse(input)), "scripts");
  if (typeof scripts !== "object" || scripts === null) {
    return [];
  }
  return Object.entries(scripts).flatMap(([name, command]) => {
    if (typeof command !== "string" || name === "test:related") {
      return [];
    }
    const lane = name.startsWith("test:") ? name.slice("test:".length) : null;
    const limit = pickLaneLimit(limits, lane);
    return collectTimeoutValues(command).flatMap((timeoutMs) => {
      const breach = findTimeoutBreach(timeoutMs, limit);
      return breach === undefined ? [] : [
        {
          path,
          message: `script "${name}" passes --timeout=${timeoutMs} to bun test, ${breach}; ${slowTestsHint}`
        }
      ];
    });
  });
}
function findMember2(value, key) {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}
function pickLaneLimit(limits, lane) {
  const limitMs = lane === null ? undefined : limits.get(lane);
  return lane === null || limitMs === undefined ? { lane: "unit", limitMs: unitLimitMs } : { lane, limitMs };
}
var printCommands = new Set(["echo", "printf"]);
var valueOptions = new Set([
  "-t",
  "--test-name-pattern",
  "--timeout",
  "--rerun-each",
  "--retry",
  "--seed",
  "--coverage-reporter",
  "--coverage-dir",
  "--reporter",
  "--reporter-outfile",
  "--max-concurrency",
  "--path-ignore-patterns",
  "--parallel-delay",
  "--shard",
  "--timings"
]);
function collectTimeoutValues(command) {
  const values = [];
  for (const words of collectShellCommands(parseShellWords(command))) {
    const name = words.find((word) => !word.isAssignment);
    if (name !== undefined && printCommands.has(name.text)) {
      continue;
    }
    const texts = words.map((word) => word.text);
    const start = findTestArgsStart(texts);
    if (start === null) {
      continue;
    }
    const args = texts.slice(start);
    for (let index = 0;index < args.length; index += 1) {
      const arg = args[index] ?? "";
      if (arg === "--") {
        break;
      }
      const value = arg === "--timeout" ? args[index + 1] : findTimeoutFlagValue(arg);
      const timeoutMs = value === undefined ? null : parseTimeoutMs(value);
      if (timeoutMs !== null) {
        values.push(timeoutMs);
      }
      if (valueOptions.has(arg)) {
        index += 1;
      }
    }
  }
  return values;
}
function collectShellCommands(words) {
  const commands = [[]];
  for (const word of words) {
    if (word.isOperator) {
      commands.push([]);
    } else {
      commands.at(-1)?.push(word);
    }
  }
  return commands;
}
function findTestArgsStart(texts) {
  for (const [index, text] of texts.entries()) {
    const subcommand = text === "bun" ? texts.findIndex((word, at) => at > index && !word.startsWith("-")) : -1;
    if (subcommand !== -1 && texts[subcommand] === "test") {
      return subcommand + 1;
    }
  }
  return null;
}
function findTimeoutFlagValue(arg) {
  return arg.startsWith("--timeout=") ? arg.slice("--timeout=".length) : undefined;
}
function parseTimeoutMs(value) {
  return /^[\d_]+$/u.test(value) && /\d/u.test(value) ? Number(value.replaceAll("_", "")) : null;
}
function findTimeoutBreach(timeoutMs, limit) {
  const limitText = `the ${limit.limitMs} ms limit of the ${limit.lane} lane`;
  if (timeoutMs === 0) {
    return `which turns the timeout off, past ${limitText}`;
  }
  return timeoutMs > limit.limitMs ? `above ${limitText}` : undefined;
}
function collectBunfigFindings(path, text, limit) {
  const timeoutMs = findMember2(findMember2(parseText(path, text, (input) => Bun.TOML.parse(input)), "test"), "timeout");
  if (typeof timeoutMs !== "number") {
    return [];
  }
  const breach = findTimeoutBreach(timeoutMs, limit);
  return breach === undefined ? [] : [
    {
      path,
      message: `[test] timeout = ${timeoutMs} applies to every test, ${breach}; ${slowTestsHint}`
    }
  ];
}
function findDirectoryLane(path, appRoots) {
  const directories = posix.dirname(path).split("/");
  for (const [index, name] of directories.entries()) {
    const parent = index === 0 ? "." : directories.slice(0, index).join("/");
    if (name === "e2e" && (parent === "." || appRoots.has(parent))) {
      return "e2e";
    }
    if (name.endsWith("-e2e") && appRoots.has(directories.slice(0, index + 1).join("/"))) {
      return "e2e";
    }
  }
  return null;
}
var guardedRules = ["zgeoff/max-test-timeout", "zgeoff/test-timeout-exception-ticket"];
var ticketPattern = /\b[A-Z][A-Z0-9]*-\d+\b/u;
var floorPattern = /\bfloor:[\s*]*[^\s*]/u;
function runTestTimeoutsCommand() {
  try {
    const findings = runTestTimeoutsCheck({ cwd: process.cwd(), env: process.env, runProgram });
    for (const finding of findings) {
      process.stdout.write(`${finding.path}: ${finding.message}
`);
    }
    return findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`test-timeouts: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
if (false) {}

// packages/chex/src/run-uncommitted-check.ts
import { existsSync as existsSync2 } from "fs";
import { join as join5 } from "path";

// packages/chex/src/read-branch-files.ts
function readBranchFiles(options) {
  const base = readBranchBase(options);
  const diff = options.runProgram([
    "git",
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    ...options.withDeleted === true ? [] : ["--diff-filter=d"],
    base,
    "HEAD"
  ], { cwd: options.cwd, env: options.env });
  if (diff.exitCode !== 0) {
    throw new Error(`git diff failed: ${diff.stderr.trim()}`);
  }
  return diff.stdout.split("\x00").filter((path) => path !== "");
}
if (false) {}

// packages/chex/src/run-uncommitted-check.ts
function runUncommittedCheck(options) {
  const changed = new Set(runGit3(options, ["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=no"]).split("\x00").map((entry) => entry.slice(3)));
  const tracked = new Set(runGit3(options, ["ls-tree", "-r", "-z", "--full-tree", "--name-only", "HEAD"]).split("\x00"));
  return options.files.filter((path) => changed.has(path) || !tracked.has(path) && options.probeFile(join5(options.cwd, path)));
}
function runGit3(options, args) {
  const result = options.runProgram(["git", ...args], { cwd: options.cwd, env: options.env });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
function runUncommittedCommand() {
  const cwd = process.cwd();
  try {
    const files = readBranchFiles({ cwd, env: process.env, runProgram, withDeleted: true });
    const changed = runUncommittedCheck({
      cwd,
      env: process.env,
      files,
      runProgram,
      probeFile: existsSync2
    });
    if (changed.length > 0) {
      process.stdout.write(`uncommitted: these files the branch changes hold a change that is not committed, so the checks would read a copy the push does not send; commit or stash it:
${changed.join(`
`)}
`);
    }
    return changed.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`uncommitted: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
if (false) {}

// packages/chex/src/run-workflows-check.ts
import { parseArgs as parseArgs3 } from "util";

// packages/chex/src/collect-command-names.ts
function collectCommandNames(words) {
  const names = splitCommands(words).map((command) => collectRunTargets(command));
  return names.every((targets) => targets !== undefined) ? names.flat() : undefined;
}
function splitCommands(words) {
  const commands = [[]];
  for (const word of words) {
    if (word.isOperator) {
      commands.push([]);
    } else {
      commands.at(-1)?.push(word);
    }
  }
  return commands;
}
var unreadablePattern = /\$\((?!\()|`|(?<!<)<<(?!<)/u;
function collectRunTargets(command) {
  const start = command.findIndex((word) => !word.isAssignment);
  const words = start === -1 ? [] : command.slice(start).map((word) => word.text);
  const [name, ...rest] = words;
  if (name === undefined) {
    return [];
  }
  if (words.some((word) => unreadablePattern.test(word)) || name.includes("$")) {
    return;
  }
  if (name === "bash" || name === "sh") {
    return collectShellTargets(name, rest);
  }
  return name === "bun" ? collectBunTargets(rest) : [name];
}
var shellLongOptions = new Set(["--login", "--noediting", "--noprofile", "--norc", "--posix"]);
function collectShellTargets(name, args) {
  let flags = "";
  let index = 0;
  while (index < args.length) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      index += 1;
      break;
    }
    if (argument === "-o" || argument === "+o") {
      index += 2;
    } else if (/^[-+][A-Za-z]+$/u.test(argument)) {
      flags += argument.slice(1);
      index += 1;
    } else if (argument.startsWith("-")) {
      if (!shellLongOptions.has(argument)) {
        return;
      }
      index += 1;
    } else {
      break;
    }
  }
  return collectShellOperandTargets(name, flags, args[index]);
}
function collectShellOperandTargets(name, flags, operand) {
  if (flags.includes("s")) {
    return [name];
  }
  if (!flags.includes("c")) {
    return operand === undefined ? [name] : [name, operand];
  }
  const words = operand === undefined ? undefined : parseShellWords(operand);
  const names = words === undefined ? undefined : collectCommandNames(words);
  return names === undefined ? undefined : [name, ...names];
}
var bunCommands = new Set([
  "a",
  "add",
  "audit",
  "build",
  "c",
  "check",
  "create",
  "dedupe",
  "exec",
  "i",
  "info",
  "init",
  "install",
  "link",
  "lint",
  "outdated",
  "patch",
  "pm",
  "prune",
  "publish",
  "remove",
  "repl",
  "rm",
  "test",
  "unlink",
  "update",
  "upgrade",
  "why",
  "x"
]);
function collectBunTargets(args) {
  const firstIndex = findBunOperand(args, 0);
  const first = firstIndex === undefined ? undefined : args[firstIndex];
  if (firstIndex === undefined) {
    return;
  }
  if (first !== "run") {
    return first === undefined || bunCommands.has(first) ? ["bun"] : ["bun", first];
  }
  const scriptIndex = findBunOperand(args, firstIndex + 1);
  const script = scriptIndex === undefined ? undefined : args[scriptIndex];
  if (scriptIndex === undefined) {
    return;
  }
  return script === undefined ? ["bun"] : ["bun", script];
}
var bunValueOptions = new Set([
  "-F",
  "--filter",
  "-r",
  "--preload",
  "--require",
  "--import",
  "-d",
  "--define",
  "-l",
  "--loader",
  "-c",
  "--config",
  "--conditions",
  "--console-depth",
  "--cpu-prof-dir",
  "--cpu-prof-interval",
  "--cpu-prof-name",
  "--cron-period",
  "--cron-title",
  "--cwd",
  "--disable-warning",
  "--dns-result-order",
  "--drop",
  "--elide-lines",
  "--env-file",
  "--extension-order",
  "--feature",
  "--fetch-preconnect",
  "--heap-prof-dir",
  "--heap-prof-interval",
  "--heap-prof-name",
  "--install",
  "--jsx-factory",
  "--jsx-fragment",
  "--jsx-import-source",
  "--jsx-runtime",
  "--main-fields",
  "--max-http-header-size",
  "--port",
  "--redirect-warnings",
  "--shell",
  "--title",
  "--tsconfig-override",
  "--unhandled-rejections",
  "--user-agent",
  "--watch-kill-signal"
]);
var bunFlagOptions = new Set([
  "-b",
  "--bun",
  "-h",
  "--help",
  "--check",
  "--cpu-prof",
  "--cpu-prof-md",
  "--experimental-http2-fetch",
  "--experimental-http3-fetch",
  "--experimental-stream-iter",
  "--expose-gc",
  "--heap-prof",
  "--heap-prof-md",
  "--hot",
  "--if-present",
  "--ignore-dce-annotations",
  "--insecure-http-parser",
  "--inspect",
  "--inspect-brk",
  "--inspect-wait",
  "--interactive",
  "--jsx-side-effects",
  "--no-addons",
  "--no-clear-screen",
  "--no-deprecation",
  "--no-env-file",
  "--no-exit-on-error",
  "--no-ffi-cc",
  "--no-install",
  "--no-macros",
  "--no-orphans",
  "--no-warnings",
  "--parallel",
  "--pending-deprecation",
  "--prefer-latest",
  "--prefer-offline",
  "--preserve-symlinks",
  "--preserve-symlinks-main",
  "--redis-preconnect",
  "--sequential",
  "--silent",
  "--smol",
  "--sql-preconnect",
  "--throw-deprecation",
  "--tls-max-v1.2",
  "--tls-max-v1.3",
  "--tls-min-v1.0",
  "--tls-min-v1.1",
  "--tls-min-v1.2",
  "--tls-min-v1.3",
  "--trace-deprecation",
  "--trace-warnings",
  "--use-bundled-ca",
  "--use-openssl-ca",
  "--use-system-ca",
  "--watch",
  "--workspaces",
  "--zero-fill-buffers"
]);
function findBunOperand(args, start) {
  let index = start;
  while (index < args.length) {
    const argument = args[index] ?? "";
    const option = argument.split("=")[0] ?? "";
    if (!argument.startsWith("-")) {
      return index;
    }
    if (bunValueOptions.has(option)) {
      index += argument.includes("=") ? 1 : 2;
    } else if (bunFlagOptions.has(option)) {
      index += 1;
    } else {
      return;
    }
  }
  return index;
}

// packages/chex/src/collect-expression-references.ts
var expressionPattern = /\$\{\{(?<body>(?:'(?:[^']|'')*'|[^'])*?)\}\}/gsu;
var indexPattern = /\[\s*'(?<name>[A-Za-z_][\w-]*)'\s*\]/gu;
var stringPattern = /'(?:[^']|'')*'/gu;
var referencePattern = /[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+/gu;
function collectExpressionReferences(text) {
  return [...text.matchAll(expressionPattern)].flatMap((expression) => {
    const body = (expression.groups?.["body"] ?? "").replaceAll(indexPattern, ".$<name>").replaceAll(stringPattern, "''");
    return [...body.matchAll(referencePattern)].map((reference) => reference[0]);
  });
}

// packages/chex/src/find-install-cache-path.ts
var installCachePattern = /(?:^|\/)(?:node_modules|\.bun\/install\/cache)(?:\/|$)/u;
function findInstallCachePath(paths) {
  return typeof paths === "string" ? paths.split(`
`).map((path) => path.trim()).find((path) => !path.startsWith("!") && !path.includes("${{") && installCachePattern.test(path)) : undefined;
}

// packages/chex/src/read-checks-profile.ts
function readChecksProfile(options) {
  const given = parseChecksProfile(options.env["CHECKS_PROFILE"]);
  if (given !== undefined) {
    return given;
  }
  const visibility = readRepoVisibility(options);
  if (visibility instanceof Error) {
    options.writeError(`workflows: the repo's visibility is unknown, so every rule applies: ${visibility.message}
`);
    return;
  }
  return visibility;
}
function parseChecksProfile(value) {
  return value === "public" || value === "private" ? value : undefined;
}
var visibilityCommand = ["gh", "repo", "view", "--json", "isPrivate", "--jq", ".isPrivate"];
function readRepoVisibility(options) {
  try {
    const result = options.runProgram(visibilityCommand, { cwd: options.cwd, env: options.env });
    const answer = result.stdout.trim();
    if (result.exitCode === 0 && (answer === "true" || answer === "false")) {
      return answer === "true" ? "private" : "public";
    }
    return new Error(`${visibilityCommand.join(" ")} exited ${result.exitCode}: ${result.stderr.trim() || answer}`);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

// packages/chex/src/run-workflows-check.ts
var workflowPathPattern = /^(?:\.github\/workflows|sync\/workflow-callers)\/[^/]+\.ya?ml$/u;
function runWorkflowsCheck(options) {
  const tracked = runGit4(options, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\x00").filter((path) => workflowPathPattern.test(path));
  const asked = new Set(options.paths);
  const paths = options.paths.length === 0 ? tracked : tracked.filter((path) => asked.has(path));
  return paths.flatMap((path) => collectWorkflowFindings(path, runGit4(options, ["show", `HEAD:${path}`]), options.profile));
}
function runGit4(options, args) {
  const result = options.runProgram(["git", ...args], { cwd: options.cwd, env: options.env });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
function collectWorkflowFindings(path, text, profile) {
  const workflow = parseWorkflow(text);
  if (workflow instanceof Error) {
    return [{ path, line: 1, message: `cannot parse the workflow: ${workflow.message}` }];
  }
  const lines = text.split(`
`);
  const context = {
    path,
    profile,
    workflow,
    lines,
    jobs: collectJobs(findMember3(workflow, "jobs"), lines),
    triggers: collectTriggers(findMember3(workflow, "on"))
  };
  return [
    ...context.jobs.flatMap((job) => jobRules.flatMap((rule) => rule(context, job))),
    ...collectConcurrencyFindings(context),
    ...collectWorkflowRunFindings(context)
  ];
}
function parseWorkflow(text) {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
function collectJobs(jobs, lines) {
  if (typeof jobs !== "object" || jobs === null) {
    return [];
  }
  const jobsLine = lines.findIndex((line) => line.startsWith("jobs:"));
  return Object.entries(jobs).map(([id, definition]) => ({
    id,
    definition,
    line: getJobLine(lines, jobsLine, id)
  }));
}
function getJobLine(lines, jobsLine, id) {
  const keyPattern = new RegExp(`^\\s+${RegExp.escape(id)}:(?:\\s|$)`, "u");
  const offset = lines.slice(jobsLine + 1).findIndex((line) => keyPattern.test(line));
  return offset === -1 ? Math.max(jobsLine + 1, 1) : jobsLine + offset + 2;
}
function findMember3(value, key) {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}
function collectTriggers(on) {
  if (typeof on === "string") {
    return new Set([on]);
  }
  if (isList2(on)) {
    return new Set(on.filter((trigger) => typeof trigger === "string"));
  }
  return typeof on === "object" && on !== null ? new Set(Object.keys(on)) : new Set;
}
function isList2(value) {
  return Array.isArray(value);
}
var jobRules = [
  collectRunFindings,
  collectTimeoutFindings,
  collectHeavyFindings,
  collectCacheFindings,
  collectCheckoutFindings
];
function collectRunFindings(context, job) {
  return collectSteps(job).flatMap((step, index) => {
    const run = findMember3(step, "run");
    const fault = typeof run === "string" ? findRunFault(run) : undefined;
    return fault === undefined ? [] : [
      {
        path: context.path,
        line: job.line,
        message: `job ${job.id}, ${formatStepLabel(step, index)}: the run ${fault}; a run holds one command on one line, and anything more goes in a script`
      }
    ];
  });
}
function collectSteps(job) {
  const steps = findMember3(job.definition, "steps");
  return isList2(steps) ? steps : [];
}
var expressionOpening = `\${{`;
var shellKeywords = new Set(["if", "for", "while", "case"]);
function findRunFault(run) {
  const command = run.trim();
  if (command.includes(`
`)) {
    return "spans more than one line";
  }
  if (command.includes(expressionOpening)) {
    return `holds a ${expressionOpening} }} expression, which belongs in env`;
  }
  const words = parseShellWords(command);
  const operator = words.find((word) => word.isOperator);
  if (operator !== undefined) {
    return `chains commands with \`${operator.text}\``;
  }
  const [first] = words;
  return first !== undefined && !first.isQuoted && shellKeywords.has(first.text) ? `starts with the shell keyword \`${first.text}\`` : undefined;
}
function formatStepLabel(step, index) {
  const name = findMember3(step, "name");
  return typeof name === "string" ? `step "${name}"` : `step ${index + 1}`;
}
function collectTimeoutFindings(context, job) {
  if (findMember3(job.definition, "uses") !== undefined) {
    return [];
  }
  return findMember3(job.definition, "timeout-minutes") === undefined ? [{ path: context.path, line: job.line, message: `job ${job.id} sets no timeout-minutes` }] : [];
}
var pullRequestTriggers = ["pull_request", "pull_request_target"];
function collectHeavyFindings(context, job) {
  const trigger = pullRequestTriggers.find((name) => context.triggers.has(name));
  const reason = findHeavyReason(job);
  return context.profile === "public" || trigger === undefined || reason === undefined ? [] : [
    {
      path: context.path,
      line: job.line,
      message: `job ${job.id} is a heavy check, because it ${reason}, in a workflow that runs on ${trigger}; a private repo runs a heavy check nightly or on dispatch, never on each pull request`
    }
  ];
}
var kvmSetupCommands = new Set(["scripts/ci/check-kvm.sh", "scripts/open-kvm.sh", "ci:open-kvm"]);
function findHeavyReason(job) {
  const runner = findHeavyRunner(findMember3(job.definition, "runs-on"));
  if (runner !== undefined) {
    return `runs on ${runner}`;
  }
  const command = collectSteps(job).map((step) => findMember3(step, "run")).filter((run) => typeof run === "string").flatMap((run) => collectCommandNames(parseShellWords(run)) ?? []).find((name) => kvmSetupCommands.has(name));
  return command === undefined ? undefined : `enables KVM through ${command}`;
}
function findHeavyRunner(runsOn) {
  if (findMember3(runsOn, "group") !== undefined) {
    return "a runner group";
  }
  const labels = [runsOn, findMember3(runsOn, "labels")].flat().filter((label) => typeof label === "string");
  if (labels.some((label) => label.includes(expressionOpening))) {
    return;
  }
  return labels.find((label) => !label.startsWith("ubuntu-"));
}
var setupBunPattern = /^oven-sh\/setup-bun(?:@|$)/u;
var cachePattern = /^actions\/cache(?:\/(?:restore|save))?(?:@|$)/u;
function collectCacheFindings(context, job) {
  const steps = collectSteps(job);
  const isBunJob = steps.some((step) => isStepUsing(step, setupBunPattern));
  return steps.flatMap((step, index) => {
    const action = findMember3(step, "uses");
    const cached = isStepUsing(step, cachePattern) ? findInstallCachePath(findMember3(findMember3(step, "with"), "path")) : undefined;
    return isBunJob && typeof action === "string" && cached !== undefined ? [
      {
        path: context.path,
        line: job.line,
        message: `job ${job.id}, ${formatStepLabel(step, index)}: a Bun job caches ${cached} with ${action}; bun install --frozen-lockfile runs faster than the cache restore`
      }
    ] : [];
  });
}
function isStepUsing(step, pattern) {
  const action = findMember3(step, "uses");
  return typeof action === "string" && pattern.test(action);
}
var checkoutPattern = /^actions\/checkout(?:@|$)/u;
function collectCheckoutFindings(context, job) {
  return collectSteps(job).flatMap((step, index) => {
    const action = findMember3(step, "uses");
    const inputs = findMember3(step, "with");
    const depth = findMember3(inputs, "fetch-depth");
    const isFullHistory = typeof action === "string" && checkoutPattern.test(action) && (depth === 0 || depth === "0");
    return isFullHistory && typeof findMember3(inputs, "filter") !== "string" ? [
      {
        path: context.path,
        line: job.line,
        message: `job ${job.id}, ${formatStepLabel(step, index)}: a checkout with fetch-depth: 0 sets filter: blob:none to clone the history without the file contents, or filter: '' when the job reads many old files`
      }
    ] : [];
  });
}
function collectConcurrencyFindings(context) {
  const deployJobs = context.jobs.filter((job) => isDeployJob(job));
  const workflowConcurrency = findMember3(context.workflow, "concurrency");
  return [
    ...deployJobs.flatMap((job) => collectDeployFindings(context, job, workflowConcurrency)),
    ...isChecksWorkflow(context) ? collectChecksFindings(context, deployJobs, workflowConcurrency) : []
  ];
}
var deployJobPattern = /release|deploy|migrate/iu;
function isDeployJob(job) {
  const name = findMember3(job.definition, "name");
  return deployJobPattern.test(job.id) || typeof name === "string" && deployJobPattern.test(name);
}
function collectDeployFindings(context, job, workflowConcurrency) {
  const concurrency = findMember3(job.definition, "concurrency");
  const hasOwnGroup = typeof findMember3(concurrency, "group") === "string" && findMember3(concurrency, "cancel-in-progress") === false;
  return [
    ...hasOwnGroup ? [] : [
      {
        path: context.path,
        line: job.line,
        message: `job ${job.id} releases or deploys, so it sets a job-level concurrency group with cancel-in-progress: false`
      }
    ],
    ...isCancelling(workflowConcurrency) ? [
      {
        path: context.path,
        line: getTopLevelLine(context.lines, "concurrency"),
        message: `the workflow-level cancel-in-progress: true can cancel job ${job.id}, which releases or deploys; set each concurrency group per job`
      }
    ] : []
  ];
}
function isCancelling(concurrency) {
  return findMember3(concurrency, "cancel-in-progress") === true;
}
function getTopLevelLine(lines, key) {
  const keyPattern = new RegExp(`^['"]?${RegExp.escape(key)}['"]?:`, "u");
  return lines.findIndex((line) => keyPattern.test(line)) + 1 || 1;
}
function isChecksWorkflow(context) {
  return context.triggers.has("pull_request") || context.triggers.has("push");
}
function collectChecksFindings(context, deployJobs, workflowConcurrency) {
  const otherJobs = context.jobs.filter((job) => !deployJobs.includes(job));
  const isEveryJobCovered = otherJobs.length > 0 && otherJobs.every((job) => isChecksGroup(context, findMember3(job.definition, "concurrency")));
  const isCovered = isChecksGroup(context, workflowConcurrency) || isEveryJobCovered;
  const workflowFindings = deployJobs.length > 0 || isCovered ? [] : [
    {
      path: context.path,
      line: getTopLevelLine(context.lines, "on"),
      message: "a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel"
    }
  ];
  const jobFindings = deployJobs.length === 0 ? [] : otherJobs.filter((job) => !isChecksGroup(context, findMember3(job.definition, "concurrency"))).map((job) => ({
    path: context.path,
    line: job.line,
    message: `job ${job.id} runs in a checks workflow beside a release or deploy job, so it sets a job-level concurrency group with cancel-in-progress: true`
  }));
  return [
    ...workflowFindings,
    ...jobFindings,
    ...collectPerRunGroupFindings(context, workflowConcurrency, getTopLevelLine(context.lines, "concurrency")),
    ...otherJobs.flatMap((job) => collectPerRunGroupFindings(context, findMember3(job.definition, "concurrency"), job.line))
  ];
}
function isChecksGroup(context, concurrency) {
  return isCancelling(concurrency) || isGateGroup(context, concurrency);
}
function isGateGroup(context, concurrency) {
  const group = findMember3(concurrency, "group");
  const cancel = findMember3(concurrency, "cancel-in-progress");
  return isMainGate(context) && typeof group === "string" && collectExpressionReferences(group).includes("github.sha") && (cancel === undefined || cancel === false);
}
function isMainGate(context) {
  const push = findMember3(findMember3(context.workflow, "on"), "push");
  const branches = [findMember3(push, "branches")].flat();
  return !pullRequestTriggers.some((name) => context.triggers.has(name)) && branches.length > 0 && branches.every((branch) => branch === "main");
}
var perRunValues = ["github.sha", "github.run_id", "github.run_number", "github.run_attempt"];
function collectPerRunGroupFindings(context, concurrency, line) {
  const group = findMember3(concurrency, "group");
  const references = typeof group === "string" ? collectExpressionReferences(group) : [];
  const allowed = isGateGroup(context, concurrency) ? "github.sha" : undefined;
  const perRun = perRunValues.find((value) => value !== allowed && references.includes(value));
  return perRun === undefined ? [] : [
    {
      path: context.path,
      line,
      message: `the concurrency group holds ${perRun}, so no newer run cancels this one`
    }
  ];
}
function collectWorkflowRunFindings(context) {
  if (!context.triggers.has("workflow_run")) {
    return [];
  }
  const trigger = findMember3(findMember3(context.workflow, "on"), "workflow_run");
  const branches = findMember3(trigger, "branches");
  return isList2(branches) && branches.length > 0 ? [] : [
    {
      path: context.path,
      line: getTopLevelLine(context.lines, "on"),
      message: "the workflow_run trigger has no branches filter, so a run of the named workflow on any branch starts it"
    }
  ];
}
function runWorkflowsCommand(args) {
  const paths = parseCLIPaths(args);
  if (paths instanceof Error) {
    process.stderr.write(`workflows: ${paths.message}
usage: chex workflows [path...]
`);
    return 2;
  }
  try {
    const findings = runWorkflowsCheck({
      cwd: process.cwd(),
      env: process.env,
      paths,
      profile: readChecksProfile({
        cwd: process.cwd(),
        env: process.env,
        runProgram,
        writeError: (text) => {
          process.stderr.write(text);
        }
      }),
      runProgram
    });
    const isActions = process.env["GITHUB_ACTIONS"] === "true";
    for (const finding of findings) {
      process.stdout.write(`${isActions ? formatAnnotation(finding) : formatLine(finding)}
`);
    }
    if (findings.length > 0) {
      process.stdout.write(`workflows: ${findings.length} ${findings.length === 1 ? "warning" : "warnings"}; the workflow lint warns and does not fail yet
`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`workflows: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
function parseCLIPaths(args) {
  try {
    return parseArgs3({ args: [...args], options: {}, allowPositionals: true, strict: true }).positionals;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
function formatAnnotation(finding) {
  const file = escapeAnnotationData(finding.path).replaceAll(":", "%3A").replaceAll(",", "%2C");
  return `::warning file=${file},line=${finding.line}::${escapeAnnotationData(finding.message)}`;
}
function escapeAnnotationData(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll(`
`, "%0A");
}
function formatLine(finding) {
  return `${finding.path}:${finding.line}: ${finding.message}`;
}
if (false) {}

// packages/chex/src/write-text-file.ts
import { mkdir, writeFile } from "fs/promises";
import { dirname as dirname3 } from "path";
async function writeTextFile(path, text) {
  await mkdir(dirname3(path), { recursive: true });
  await writeFile(path, text);
}

// packages/chex/src/cli.ts
process.exitCode = await runChex(process.argv.slice(2), {
  runCheck: makeCheckRunner({
    docsFolder: join6(import.meta.dir, "docs"),
    runScript: (argv) => Bun.spawn([...argv], { stdio: ["inherit", "inherit", "inherit"] }).exited,
    repoChecks: {
      commits: runCommitsCommand,
      "local-paths": runLocalPathsCommand,
      "test-timeouts": runTestTimeoutsCommand,
      workflows: runWorkflowsCommand,
      "dependency-gates": runDependencyGatesCommand,
      uncommitted: runUncommittedCommand
    }
  }),
  runInit: () => runInit({
    repoRoot: process.cwd(),
    readText: readOptionalText,
    writeText: writeTextFile,
    renameFile: (from, to) => rename(from, to),
    removeFile: (path) => rm(path, { force: true }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    }
  }),
  writeOutput: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  }
});
