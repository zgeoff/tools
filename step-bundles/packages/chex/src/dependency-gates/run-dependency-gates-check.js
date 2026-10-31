// @bun
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
function isRecord(value) {
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
  const install = isRecord(parsed) ? parsed["install"] : undefined;
  const excludes = isRecord(install) ? install["minimumReleaseAgeExcludes"] : undefined;
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
  if (!isRecord(report)) {
    throw new TypeError("bun audit --json printed no object");
  }
  return Object.entries(report).flatMap(([packageName, advisories]) => {
    if (!Array.isArray(advisories)) {
      throw new TypeError(`bun audit --json lists no advisories for ${packageName}`);
    }
    return advisories.map((advisory) => {
      if (!isRecord(advisory) || typeof advisory["id"] !== "number" || typeof advisory["url"] !== "string") {
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
  if (!isRecord(plan)) {
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
    if (!isRecord(entry) || typeof entry["name"] !== "string") {
      throw new TypeError(`bun audit fix --json has an entry with no name in its ${key} list`);
    }
    return entry["name"];
  });
}

// packages/chex/src/dependency-gates/parse-lockfile-dependents.ts
function parseLockfileDependents(lockfile) {
  const parsed = Bun.JSONC.parse(lockfile);
  const workspaces = isRecord(parsed) ? parsed["workspaces"] : undefined;
  const packages = isRecord(parsed) ? parsed["packages"] : undefined;
  if (!isRecord(workspaces)) {
    throw new TypeError("bun.lock has no workspaces object");
  }
  if (!isRecord(packages)) {
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
  if (!isRecord(metadata)) {
    return [];
  }
  return fields.flatMap((field) => {
    const ranges = metadata[field];
    if (!isRecord(ranges)) {
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
  if (!isRecord(manifest)) {
    throw new TypeError("package.json holds no object");
  }
  const workspaces = manifest["workspaces"];
  const catalog = isRecord(workspaces) ? workspaces["catalog"] : undefined;
  const catalogs = isRecord(workspaces) ? workspaces["catalogs"] : undefined;
  const scripts = manifest["scripts"];
  const audit = isRecord(scripts) ? scripts["audit"] : undefined;
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
  if (!isRecord(value)) {
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
  if (!isRecord(value)) {
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
if (import.meta.main) {
  process.exitCode = runDependencyGatesCommand();
}
export {
  runDependencyGatesCheck,
  runDependencyGatesCommand
};
