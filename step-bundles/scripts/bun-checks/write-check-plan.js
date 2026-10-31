// @bun
// scripts/bun-checks/write-check-plan.ts
import { join } from "path";

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
  readFilePaths: async (folder) => {
    try {
      await stat(folder);
    } catch {
      return [];
    }
    const paths = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: folder }));
    return paths.toSorted();
  },
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
import { parseArgs } from "util";
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

// scripts/bun-checks/parse-docs-checks.ts
function parseDocsChecks(script) {
  if (script === undefined) {
    return { kind: "none" };
  }
  const [program, ...words] = script.trim().split(/\s+/u);
  const refusal = {
    kind: "refused",
    message: `package.json runs "${script}" as check:docs; write it as chex and the docs checks it takes, from ${docsCheckNames.join(", ")}, such as "chex prose length links", so CI runs each check as its own step.`
  };
  return M(parseChexArgs(words)).with({ kind: "checks" }, (request) => program === "chex" && request.args.length === 0 && request.names.every((name) => docsCheckNames.some((docsName) => docsName === name)) ? { kind: "named", checks: request.names } : refusal).with({ kind: "init" }, () => refusal).with({ kind: "refused" }, () => refusal).exhaustive();
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
  const scripts = findScripts(packageJSON);
  const docsScript = scripts["check:docs"];
  const docsText = typeof docsScript === "string" ? docsScript : undefined;
  const plan = planCheckScripts({
    scripts: step.scripts,
    defined: Object.keys(scripts),
    part,
    lane: step.lane
  });
  return M(parseDocsChecks(docsText)).with({ kind: "refused" }, (docs) => Promise.resolve([docs.message])).with({ kind: "none" }, () => writePlanOutcome(plan, "", step)).with({ kind: "named" }, (docs) => writePlanOutcome(plan, ` ${docs.checks.join(" ")} `, step)).exhaustive();
}
function findScripts(value) {
  if (typeof value !== "object" || value === null || !("scripts" in value)) {
    return {};
  }
  const scripts = value.scripts;
  return typeof scripts === "object" && scripts !== null ? { ...scripts } : {};
}
var planOutcomeWriters = {
  missing: (plan) => Promise.resolve([
    `package.json defines no script named: ${plan.missing.join(" ")}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`
  ]),
  planned: async (plan, docs, step) => {
    await writeStepOutputs(step.fileSystem, step.outputPath, {
      scripts: ` ${plan.scripts.join(" ")} `,
      static: ` ${plan.static.join(" ")} `,
      test: ` ${plan.test.join(" ")} `,
      lanes: JSON.stringify(plan.lanes),
      docs
    });
    return [];
  }
};
function writePlanOutcome(plan, docs, step) {
  const writeOutcome = planOutcomeWriters[plan.kind];
  return writeOutcome(plan, docs, step);
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
