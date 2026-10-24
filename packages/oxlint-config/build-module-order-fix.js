import isStaticValue from './is-static-value.js';

// oxlint applies one fix pass to a file, so one fix moves every safe
// declaration the reports name
export default function buildModuleOrderFix(context, layout) {
  const names = collectNames(context);
  const reported = new Set(layout.reports.map((report) => report.entry));
  const stacks = new Map();
  const helpers = [];
  const declarations = [];

  for (const report of layout.reports) {
    const entry = report.entry;

    if (entry.kind === 'supporting' && isSafeToMove(entry, names)) {
      declarations.push(entry);
    }

    if (entry.kind === 'function' && layout.ranks.has(entry) && !entry.isOverloaded) {
      stacks.set(entry, collectStack(entry, layout, { reported, names }));
      helpers.push(entry);
    }
  }

  const order = buildOrder(layout, { helpers, declarations, stacks });
  const isUnchanged = order.every((entry, index) => entry === layout.entries[index]);

  if (isUnchanged || isJoiningStatements(context.sourceCode.text, order)) {
    return { fix: null, moved: new Set() };
  }

  const [range, text] = renderOrder(context, layout.entries, order);

  return {
    fix: (fixer) => fixer.replaceTextRange(range, text),
    moved: new Set([...helpers, ...declarations]),
  };
}

function collectNames(context) {
  const programScope = context.sourceCode.getScope(context.sourceCode.ast);
  const scope = programScope.childScopes.find((child) => child.type === 'module') ?? programScope;
  const imports = new Set();
  const locals = new Set();

  for (const variable of scope.variables) {
    const isImport = variable.defs.some((definition) => definition.type === 'ImportBinding');

    (isImport ? imports : locals).add(variable.name);
  }

  return { imports, locals };
}

function isSafeToMove(entry, names) {
  const type = entry.declaration.type;

  if (type === 'TSTypeAliasDeclaration' || type === 'TSInterfaceDeclaration') {
    return true;
  }

  if (type !== 'VariableDeclaration') {
    return false;
  }

  const isUsedAfterLoad = entry.references.every(
    (reference) =>
      reference.source === entry ||
      (reference.source !== null && !reference.source.isLive && !reference.isLoadTime),
  );

  return isUsedAfterLoad && isStaticValue(entry.declaration.declarations[0].init, names);
}

// a function declaration is hoisted, so the helper itself always moves
function collectStack(helper, layout, context) {
  return layout.entries.filter(
    (entry) =>
      entry.kind === 'supporting' &&
      layout.homes.get(entry) === helper &&
      !context.reported.has(entry) &&
      isSafeToMove(entry, context.names),
  );
}

function buildOrder(layout, moves) {
  const moving = new Set([
    ...moves.helpers.flatMap((helper) => [...moves.stacks.get(helper), helper]),
    ...moves.declarations,
  ]);
  const order = layout.entries.filter((entry) => !moving.has(entry));
  const helpers = moves.helpers.toSorted(
    (first, second) => layout.ranks.get(first) - layout.ranks.get(second),
  );

  for (const helper of helpers) {
    const previous = layout.mainOrder[layout.ranks.get(helper) - 1];

    order.splice(findInsertAfter(order, previous), 0, ...moves.stacks.get(helper), helper);
  }

  const placed = new Set();

  const place = (entry) => {
    if (placed.has(entry)) {
      return;
    }

    placed.add(entry);

    const users = layout.collectBlockUsers(entry);

    for (const user of users) {
      if (moves.declarations.includes(user)) {
        place(user);
      }
    }

    const positions = users.map((user) => order.indexOf(user)).filter((index) => index !== -1);

    order.splice(Math.min(...positions), 0, entry);
  };

  for (const entry of moves.declarations) {
    place(entry);
  }

  return order;
}

function findInsertAfter(order, previous) {
  const at = order.indexOf(previous) + 1;
  const next = order[at];
  const isExportOfPrevious =
    next !== undefined &&
    next.statement.type === 'ExportDefaultDeclaration' &&
    next.declaration.type === 'Identifier' &&
    next.declaration.name === previous.name;

  return isExportOfPrevious ? at + 1 : at;
}

// a statement that ends without a semicolon runs on into a next statement
// that opens with a bracket or an operator, so the fix never puts one there
function isJoiningStatements(text, order) {
  return order.some(
    (entry, index) =>
      index > 0 &&
      order[index - 1].index !== entry.index - 1 &&
      !isTerminated(text, order[index - 1]) &&
      /^[([`+\-/<]/u.test(text[entry.statement.range[0]]),
  );
}

const blockDeclarationTypes = new Set([
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
]);

function isTerminated(text, entry) {
  return (
    text[entry.statement.range[1] - 1] === ';' || blockDeclarationTypes.has(entry.declaration.type)
  );
}

function renderOrder(context, entries, order) {
  const text = context.sourceCode.text;
  const chunks = collectChunks(context, entries);
  const first = entries.findIndex((entry, index) => order[index] !== entry);
  const last = entries.findLastIndex((entry, index) => order[index] !== entry);
  const parts = [];

  for (let index = first; index <= last; index++) {
    const chunk = chunks[order[index].index];

    if (index > first) {
      const isSamePrevious = order[index - 1].index === order[index].index - 1;
      const gap = isSamePrevious
        ? text.slice(chunks[order[index].index - 1].end, chunk.start)
        : '\n\n';

      parts.push(gap);
    }

    parts.push(text.slice(chunk.start, chunk.end));
  }

  return [[chunks[first].start, chunks[last].end], parts.join('')];
}

function collectChunks(context, entries) {
  const text = context.sourceCode.text;
  const comments = context.sourceCode.getAllComments();

  return entries.map((entry, index) => {
    const [statementStart, statementEnd] = entry.statement.range;
    const nextStart = entries[index + 1]?.statement.range[0] ?? text.length;
    const trailing = comments.findLast(
      (comment) =>
        comment.range[0] >= statementEnd &&
        comment.range[1] <= nextStart &&
        !text.slice(statementEnd, comment.range[0]).includes('\n'),
    );
    const end = trailing?.range[1] ?? statementEnd;

    if (index === 0) {
      return { start: findAdjacentCommentsStart(text, comments, statementStart), end };
    }

    const [, previousEnd] = entries[index - 1].statement.range;
    const leading = comments.find(
      (comment) =>
        comment.range[0] >= previousEnd &&
        comment.range[1] <= statementStart &&
        text.slice(previousEnd, comment.range[0]).includes('\n'),
    );

    return { start: leading?.range[0] ?? statementStart, end };
  });
}

function findAdjacentCommentsStart(text, comments, start) {
  let current = start;

  for (const comment of comments.toReversed()) {
    const gap = text.slice(comment.range[1], current);

    if (comment.range[1] > current) {
      continue;
    }

    if (gap.trim() !== '' || gap.split('\n').length > 2) {
      break;
    }

    current = comment.range[0];
  }

  return current;
}
