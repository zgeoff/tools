// @bun
// packages/chex/src/run-workflows-check.ts
import { parseArgs } from "util";

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

// packages/chex/src/run-workflows-check.ts
var workflowPathPattern = /^(?:\.github\/workflows|sync\/workflow-callers)\/[^/]+\.ya?ml$/u;
function runWorkflowsCheck(options) {
  const tracked = runGit(options, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\x00").filter((path) => workflowPathPattern.test(path));
  const asked = new Set(options.paths);
  const paths = options.paths.length === 0 ? tracked : tracked.filter((path) => asked.has(path));
  return paths.flatMap((path) => collectWorkflowFindings(path, runGit(options, ["show", `HEAD:${path}`]), options.profile));
}
function runGit(options, args) {
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
    jobs: collectJobs(findMember(workflow, "jobs"), lines),
    triggers: collectTriggers(findMember(workflow, "on"))
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
function findMember(value, key) {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}
function collectTriggers(on) {
  if (typeof on === "string") {
    return new Set([on]);
  }
  if (isList(on)) {
    return new Set(on.filter((trigger) => typeof trigger === "string"));
  }
  return typeof on === "object" && on !== null ? new Set(Object.keys(on)) : new Set;
}
function isList(value) {
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
    const run = findMember(step, "run");
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
  const steps = findMember(job.definition, "steps");
  return isList(steps) ? steps : [];
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
  const name = findMember(step, "name");
  return typeof name === "string" ? `step "${name}"` : `step ${index + 1}`;
}
function collectTimeoutFindings(context, job) {
  if (findMember(job.definition, "uses") !== undefined) {
    return [];
  }
  return findMember(job.definition, "timeout-minutes") === undefined ? [{ path: context.path, line: job.line, message: `job ${job.id} sets no timeout-minutes` }] : [];
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
  const runner = findHeavyRunner(findMember(job.definition, "runs-on"));
  if (runner !== undefined) {
    return `runs on ${runner}`;
  }
  const command = collectSteps(job).map((step) => findMember(step, "run")).filter((run) => typeof run === "string").flatMap((run) => collectCommandNames(parseShellWords(run)) ?? []).find((name) => kvmSetupCommands.has(name));
  return command === undefined ? undefined : `enables KVM through ${command}`;
}
function findHeavyRunner(runsOn) {
  if (findMember(runsOn, "group") !== undefined) {
    return "a runner group";
  }
  const labels = [runsOn, findMember(runsOn, "labels")].flat().filter((label) => typeof label === "string");
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
    const action = findMember(step, "uses");
    const cached = isStepUsing(step, cachePattern) ? findInstallCachePath(findMember(findMember(step, "with"), "path")) : undefined;
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
  const action = findMember(step, "uses");
  return typeof action === "string" && pattern.test(action);
}
var checkoutPattern = /^actions\/checkout(?:@|$)/u;
function collectCheckoutFindings(context, job) {
  return collectSteps(job).flatMap((step, index) => {
    const action = findMember(step, "uses");
    const inputs = findMember(step, "with");
    const depth = findMember(inputs, "fetch-depth");
    const isFullHistory = typeof action === "string" && checkoutPattern.test(action) && (depth === 0 || depth === "0");
    return isFullHistory && typeof findMember(inputs, "filter") !== "string" ? [
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
  const workflowConcurrency = findMember(context.workflow, "concurrency");
  return [
    ...deployJobs.flatMap((job) => collectDeployFindings(context, job, workflowConcurrency)),
    ...isChecksWorkflow(context) ? collectChecksFindings(context, deployJobs, workflowConcurrency) : []
  ];
}
var deployJobPattern = /release|deploy|migrate/iu;
function isDeployJob(job) {
  const name = findMember(job.definition, "name");
  return deployJobPattern.test(job.id) || typeof name === "string" && deployJobPattern.test(name);
}
function collectDeployFindings(context, job, workflowConcurrency) {
  const concurrency = findMember(job.definition, "concurrency");
  const hasOwnGroup = typeof findMember(concurrency, "group") === "string" && findMember(concurrency, "cancel-in-progress") === false;
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
  return findMember(concurrency, "cancel-in-progress") === true;
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
  const isEveryJobCovered = otherJobs.length > 0 && otherJobs.every((job) => isChecksGroup(context, findMember(job.definition, "concurrency")));
  const isCovered = isChecksGroup(context, workflowConcurrency) || isEveryJobCovered;
  const workflowFindings = deployJobs.length > 0 || isCovered ? [] : [
    {
      path: context.path,
      line: getTopLevelLine(context.lines, "on"),
      message: "a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel"
    }
  ];
  const jobFindings = deployJobs.length === 0 ? [] : otherJobs.filter((job) => !isChecksGroup(context, findMember(job.definition, "concurrency"))).map((job) => ({
    path: context.path,
    line: job.line,
    message: `job ${job.id} runs in a checks workflow beside a release or deploy job, so it sets a job-level concurrency group with cancel-in-progress: true`
  }));
  return [
    ...workflowFindings,
    ...jobFindings,
    ...collectPerRunGroupFindings(context, workflowConcurrency, getTopLevelLine(context.lines, "concurrency")),
    ...otherJobs.flatMap((job) => collectPerRunGroupFindings(context, findMember(job.definition, "concurrency"), job.line))
  ];
}
function isChecksGroup(context, concurrency) {
  return isCancelling(concurrency) || isGateGroup(context, concurrency);
}
function isGateGroup(context, concurrency) {
  const group = findMember(concurrency, "group");
  const cancel = findMember(concurrency, "cancel-in-progress");
  return isMainGate(context) && typeof group === "string" && collectExpressionReferences(group).includes("github.sha") && (cancel === undefined || cancel === false);
}
function isMainGate(context) {
  const push = findMember(findMember(context.workflow, "on"), "push");
  const branches = [findMember(push, "branches")].flat();
  return !pullRequestTriggers.some((name) => context.triggers.has(name)) && branches.length > 0 && branches.every((branch) => branch === "main");
}
var perRunValues = ["github.sha", "github.run_id", "github.run_number", "github.run_attempt"];
function collectPerRunGroupFindings(context, concurrency, line) {
  const group = findMember(concurrency, "group");
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
  const trigger = findMember(findMember(context.workflow, "on"), "workflow_run");
  const branches = findMember(trigger, "branches");
  return isList(branches) && branches.length > 0 ? [] : [
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
      profile: parseChecksProfile(process.env["CHECKS_PROFILE"]),
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
    return parseArgs({ args: [...args], options: {}, allowPositionals: true, strict: true }).positionals;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
function parseChecksProfile(value) {
  return value === "public" || value === "private" ? value : undefined;
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
if (import.meta.main) {
  process.exitCode = runWorkflowsCommand(process.argv.slice(2));
}
export {
  runWorkflowsCheck,
  runWorkflowsCommand
};
