// @bun
// packages/chex/src/run-test-timeouts-check.ts
import { basename, dirname, posix } from "path";

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

// packages/chex/src/run-test-timeouts-check.ts
function runTestTimeoutsCheck(options) {
  const paths = runGit(options, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\x00");
  const configText = paths.includes(oxlintConfigPath) ? runGit(options, ["show", `HEAD:${oxlintConfigPath}`]) : null;
  const limits = parseLaneLimits(configText);
  const appRoots = new Set(paths.filter((path) => basename(path) === "package.json").map((path) => dirname(path)));
  return paths.filter((path) => checkedFiles.has(basename(path)) || configPattern.test(basename(path))).flatMap((path) => {
    const text = runGit(options, ["show", `HEAD:${path}`]);
    if (configPattern.test(basename(path))) {
      return collectConfigFindings(path, text);
    }
    return basename(path) === "package.json" ? collectScriptFindings(path, text, limits) : collectBunfigFindings(path, text, pickLaneLimit(limits, findDirectoryLane(path, appRoots)));
  });
}
var configPattern = /^\.?oxlintrc(?:\.[\w-]+)?\.jsonc?$/u;
var oxlintConfigPath = ".oxlintrc.json";
var checkedFiles = new Set(["package.json", "bunfig.toml"]);
function runGit(options, args) {
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
if (import.meta.main) {
  process.exitCode = runTestTimeoutsCommand();
}
export {
  runTestTimeoutsCheck,
  runTestTimeoutsCommand
};
