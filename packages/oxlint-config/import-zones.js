import { isBuiltin } from 'node:module';
import { relative, sep } from 'node:path';
import collectZoneNames from './collect-zone-names.js';
import getZoneOptions from './get-zone-options.js';
import importZonesSchema from './import-zones-schema.js';
import isEdgeRefusing from './is-edge-refusing.js';
import isEntryApplying from './is-entry-applying.js';
import isInAnyZone from './is-in-any-zone.js';
import loadWorkspaceManifests from './load-workspace-manifests.js';
import resolveImportTarget from './resolve-import-target.js';
import resolveRepoRoot from './resolve-repo-root.js';

const importZones = {
  meta: {
    type: 'problem',
    messages: {
      edge: '{{rule}}: {{from}} must not import {{target}} ({{to}}){{reason}}',
      module: '{{rule}}: {{module}} is allowed only in {{allow}}{{reason}}',
      global: '{{rule}}: {{global}}() is allowed only in {{allow}}{{reason}}',
      unzoned: '{{rule}}: this file belongs to none of {{zones}}; add its path to one{{reason}}',
      unresolved: '{{rule}}: cannot resolve {{specifier}}{{reason}}',
      self: '{{rule}}: {{specifier}} names the package this file belongs to; import it by a relative path{{reason}}',
      computed: '{{rule}}: cannot check a computed import specifier{{reason}}',
    },
    schema: [importZonesSchema],
  },
  create(context) {
    const file = loadFileState(context);

    return {
      Program(node) {
        checkUnzoned(file, node);
      },
      ImportDeclaration(node) {
        checkImport(file, { node, source: node.source, typeOnly: isTypeOnlyImport(node) });
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          checkImport(file, { node, source: node.source, typeOnly: isTypeOnlyExport(node) });
        }
      },
      ExportAllDeclaration(node) {
        checkImport(file, { node, source: node.source, typeOnly: node.exportKind === 'type' });
      },
      ImportExpression(node) {
        checkImport(file, { node, source: node.source, typeOnly: false });
      },
      TSImportType(node) {
        checkImport(file, { node, source: node.source ?? node.argument?.literal, typeOnly: true });
      },
      TSImportEqualsDeclaration(node) {
        const reference = node.moduleReference;

        if (reference.type === 'TSExternalModuleReference') {
          const typeOnly = node.importKind === 'type';

          checkImport(file, { node, source: reference.expression, typeOnly });
        }
      },
      CallExpression(node) {
        checkGlobalCall(file, node);

        if (
          (node.callee.type === 'Identifier' && node.callee.name === 'require') ||
          isImportMetaRequire(node.callee)
        ) {
          checkImport(file, { node, source: node.arguments[0], typeOnly: false });
        }
      },

      // Bun's import.meta.require used as a value, such as `const load =
      // import.meta.require`, loads modules no specifier names
      MemberExpression(node) {
        if (isImportMetaRequire(node) && node.parent?.callee !== node) {
          emitUnresolved(file, node, { messageId: 'computed', data: {} });
        }
      },
    };
  },
};

export default importZones;

function loadFileState(context) {
  const options = getZoneOptions(context.options[0] ?? {});
  const filename = context.physicalFilename;
  const root = resolveRepoRoot(filename) ?? context.cwd;
  const path = toRootPath(root, filename);

  const workspaces = loadWorkspaceManifests(root, options.workspaces);

  return {
    context,
    options,
    filename,
    root,
    path,
    workspaces,
    zones: collectZoneNames(options.zones, path),
  };
}

function toRootPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function checkUnzoned(file, program) {
  // anchor on the first statement, not offset 0, so a disable comment at the
  // top of the file covers the report
  const start = program.body[0]?.loc.start ?? { line: 1, column: 0 };

  for (const entry of collectEntries(file, file.options.unzoned)) {
    if (!isInAnyZone(file.zones, entry.zones)) {
      emitReport(file, entry, {
        at: { loc: { start, end: start } },
        messageId: 'unzoned',
        data: { zones: formatZones(entry.zones) },
      });
    }
  }
}

function collectEntries(file, entries) {
  return entries.filter((entry) => isEntryApplying(entry, file.path, file.zones));
}

function emitReport(file, entry, report) {
  const reason = entry.reason === undefined ? '' : ` — ${entry.reason}`;

  file.context.report({
    ...report.at,
    messageId: report.messageId,
    data: { rule: entry.name, reason, ...report.data },
  });
}

function formatZones(names) {
  return names.length === 0 ? 'no zone' : names.join(', ');
}

function checkImport(file, imported) {
  const specifier = findStaticSpecifier(imported.source);

  if (specifier === null) {
    emitUnresolved(file, imported.node, { messageId: 'computed', data: {} });

    return;
  }

  const target = resolveImportTarget(file.filename, specifier, {
    root: file.root,
    extensions: file.options.extensions,
    conditions: file.options.conditions,
    workspaces: file.workspaces,
  });

  if (target.self === true) {
    emitSelfImport(file, imported.node, specifier);
  }

  if (target.kind === 'module') {
    checkModule(file, imported, target.specifier);
  } else if (target.kind === 'missing') {
    emitUnresolved(file, imported.node, { messageId: 'unresolved', data: { specifier } });
  } else {
    checkEdge(file, imported, toRootPath(file.root, target.path));
  }
}

function findStaticSpecifier(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
  }

  return null;
}

function emitUnresolved(file, node, report) {
  for (const entry of collectEntries(file, file.options.unresolved)) {
    emitReport(file, entry, { at: { node }, ...report });
  }
}

function emitSelfImport(file, node, specifier) {
  for (const entry of collectEntries(file, file.options.selfImports)) {
    emitReport(file, entry, { at: { node }, messageId: 'self', data: { specifier } });
  }
}

function checkModule(file, imported, specifier) {
  for (const entry of collectEntries(file, file.options.modules)) {
    const isAllowed =
      isInAnyZone(file.zones, entry.allow) || (imported.typeOnly && entry.allowTypeOnly === true);

    if (!isAllowed && isRestrictedModule(entry, specifier)) {
      emitReport(file, entry, {
        at: { node: imported.node },
        messageId: 'module',
        data: { module: specifier, allow: formatZones(entry.allow) },
      });
    }
  }
}

function isRestrictedModule(entry, specifier) {
  const name = toModuleName(specifier);

  return entry.modules.some((module) => {
    if (module.endsWith('*')) {
      return isPrefixMatch(module.slice(0, -1), specifier);
    }

    const restricted = toModuleName(module);

    return name === restricted || name.startsWith(`${restricted}/`);
  });
}

function toModuleName(specifier) {
  return specifier.replace(/^node:/u, '');
}

// `node:*` names every builtin, which a specifier may write without the prefix
function isPrefixMatch(prefix, specifier) {
  if (specifier.startsWith(prefix)) {
    return true;
  }

  return prefix === 'node:' && isBuiltin(specifier);
}

function checkEdge(file, imported, target) {
  const edgeImport = {
    from: file.path,
    to: target,
    fromZones: file.zones,
    toZones: collectZoneNames(file.options.zones, target),
    typeOnly: imported.typeOnly,
  };

  for (const entry of file.options.edges) {
    if (isEdgeRefusing(entry, edgeImport)) {
      emitReport(file, entry, {
        at: { node: imported.node },
        messageId: 'edge',
        data: {
          from: formatZones(entry.from.filter((name) => file.zones.includes(name))),
          target,
          to: formatZones(edgeImport.toZones),
        },
      });
    }
  }
}

function isTypeOnlyImport(node) {
  return (
    node.importKind === 'type' ||
    (node.specifiers.length > 0 && node.specifiers.every((entry) => entry.importKind === 'type'))
  );
}

function isTypeOnlyExport(node) {
  return (
    node.exportKind === 'type' ||
    (node.specifiers.length > 0 && node.specifiers.every((entry) => entry.exportKind === 'type'))
  );
}

function checkGlobalCall(file, node) {
  for (const entry of collectEntries(file, file.options.globals)) {
    const global = findGlobalCallName(file, node, entry.globals);

    if (global !== null && !isInAnyZone(file.zones, entry.allow)) {
      emitReport(file, entry, {
        at: { node },
        messageId: 'global',
        data: { global, allow: formatZones(entry.allow) },
      });
    }
  }
}

const globalObjects = new Set(['globalThis', 'self', 'window']);

function findGlobalCallName(file, node, names) {
  const callee = node.callee;
  let name = null;
  let binding = null;

  if (callee.type === 'Identifier' && names.includes(callee.name)) {
    name = callee.name;
    binding = callee.name;
  } else if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    globalObjects.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    names.includes(callee.property.name)
  ) {
    name = callee.property.name;
    binding = callee.object.name;
  }

  return name === null || isLocalBinding(file, node, binding) ? null : name;
}

function isLocalBinding(file, node, name) {
  let scope = file.context.sourceCode.getScope(node);

  while (scope !== null) {
    if ((scope.set.get(name)?.defs.length ?? 0) > 0) {
      return true;
    }

    scope = scope.upper;
  }

  return false;
}

function isImportMetaRequire(node) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    node.object.property.name === 'meta' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'require'
  );
}
