export default function collectModuleEntries(context, program) {
  const overloaded = new Set();
  const entries = program.body.map((statement, index) => {
    const exportKind = pickExportKind(statement);
    const declaration = exportKind === null ? statement : statement.declaration;

    if (declaration.type === 'TSDeclareFunction' && declaration.id !== null) {
      overloaded.add(declaration.id.name);
    }

    return { index, statement, declaration, exportKind, ...pickKind(statement, declaration) };
  });

  const listed = new Set(
    program.body
      .filter((statement) => statement.type === 'ExportNamedDeclaration' && isExportOnly(statement))
      .flatMap((statement) => statement.specifiers.map((specifier) => specifier.local.name)),
  );

  for (const entry of entries) {
    entry.isOverloaded = entry.kind === 'function' && overloaded.has(entry.name);

    if (entry.exportKind === null && listed.has(entry.name)) {
      entry.exportKind = 'named';
    }
  }

  linkReferences(context, program, entries);
  markLiveEntries(entries);

  return entries;
}

function pickExportKind(statement) {
  if (statement.type === 'ExportDefaultDeclaration') {
    return 'default';
  }

  return statement.type === 'ExportNamedDeclaration' && statement.declaration !== null
    ? 'named'
    : null;
}

function pickKind(statement, declaration) {
  const links = { uses: [], users: new Set(), references: [] };

  if (statement.type === 'ImportDeclaration') {
    return { kind: 'import', name: null, nameNode: statement, ...links };
  }

  if (declaration.type === 'FunctionDeclaration' && declaration.id === null) {
    return { kind: 'function', name: 'default', nameNode: statement, ...links };
  }

  if (statement.type === 'ExportDefaultDeclaration' && declaration.type !== 'FunctionDeclaration') {
    return { kind: 'other', name: 'default', nameNode: statement, ...links };
  }

  const name = findDeclarationName(declaration);

  if (name === null) {
    return { kind: 'other', name: null, nameNode: statement, ...links };
  }

  const kind = declaration.type === 'FunctionDeclaration' ? 'function' : 'supporting';

  return { kind, name: name.name, nameNode: name, ...links };
}

function findDeclarationName(declaration) {
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'TSTypeAliasDeclaration' ||
    declaration.type === 'TSInterfaceDeclaration' ||
    declaration.type === 'TSEnumDeclaration'
  ) {
    return declaration.id;
  }

  if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
    return null;
  }

  const [declarator, ...rest] = declaration.declarations;
  const isPlain =
    rest.length === 0 && declarator.id.type === 'Identifier' && declarator.init !== null;

  return isPlain ? declarator.id : null;
}

function isExportOnly(statement) {
  return (
    (statement.type === 'ExportDefaultDeclaration' &&
      statement.declaration.type === 'Identifier') ||
    (statement.type === 'ExportNamedDeclaration' &&
      statement.declaration === null &&
      statement.source === null)
  );
}

function linkReferences(context, program, entries) {
  const programScope = context.sourceCode.getScope(program);
  const scope = programScope.childScopes.find((child) => child.type === 'module') ?? programScope;
  const findEntry = (position) =>
    entries.find(
      (entry) => entry.statement.range[0] <= position && position < entry.statement.range[1],
    );

  for (const variable of scope.variables) {
    const [definition] = variable.defs;
    const target = definition === undefined ? undefined : findEntry(definition.name.range[0]);

    if (target === undefined || target.kind === 'import') {
      continue;
    }

    for (const reference of variable.references) {
      const identifier = reference.identifier;
      const source = findEntry(identifier.range[0]) ?? null;

      target.references.push({ identifier, source, isLoadTime: isLoadTime(identifier) });

      if (source !== null && source !== target) {
        source.uses.push({ target, position: identifier.range[0] });
        target.users.add(source);
      }
    }
  }

  for (const entry of entries) {
    entry.uses.sort((first, second) => first.position - second.position);
  }
}

// a function under a call, such as a `.map` callback or the function in
// `(() => value).call()`, may run at once, so it defers nothing
function isLoadTime(identifier) {
  const ancestors = [];

  for (let node = identifier.parent; node.type !== 'Program'; node = node.parent) {
    ancestors.push(node);
  }

  return !ancestors.some(
    (node, index) =>
      isFunctionNode(node) &&
      !ancestors.slice(index + 1).some((ancestor) => isInvocation(ancestor)),
  );
}

function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function isInvocation(node) {
  return (
    node.type === 'CallExpression' ||
    node.type === 'NewExpression' ||
    node.type === 'TaggedTemplateExpression'
  );
}

function markLiveEntries(entries) {
  const live = new Set();
  const pending = [];

  for (const target of entries) {
    const isSeed = target.references.some(
      (reference) =>
        reference.isLoadTime &&
        reference.source !== null &&
        reference.source !== target &&
        !isExportOnly(reference.source.statement),
    );

    if (isSeed) {
      live.add(target);
      pending.push(target);
    }
  }

  while (pending.length > 0) {
    const entry = pending.pop();

    for (const use of entry.uses) {
      if (!live.has(use.target)) {
        live.add(use.target);
        pending.push(use.target);
      }
    }
  }

  for (const entry of entries) {
    entry.isLive = live.has(entry);
  }
}
