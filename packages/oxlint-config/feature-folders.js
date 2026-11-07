import { basename, join, posix, relative, sep } from 'node:path';
import buildImportSettings from './build-import-settings.js';
import findFeatureFolder from './find-feature-folder.js';
import pickFolderKind from './pick-folder-kind.js';
import readLooseModules from './read-loose-modules.js';
import readStalePending from './read-stale-pending.js';
import resolveImportTarget from './resolve-import-target.js';
import resolveRepoRoot from './resolve-repo-root.js';
import resolveSourcePackage from './resolve-source-package.js';

const looseModuleLimit = 8;

const capLine = `{{source}} holds {{count}} loose modules, and the limit is ${looseModuleLimit}. Group them into one folder per thing the package does:`;

const exampleTree = `

  src/
    index.ts  cli.ts        index.ts, types.ts, constants.ts and the files package.json names stay
    invoices/               create-invoice.ts  format-invoice-total.ts
    payments/               charge-card.ts  refund-payment.ts
    utils/                  to-cents.ts         code that several folders share`;

// a report on one file per repo shows once per run, and an editor's
// language server keeps it on that file across edits
const anchorFiles = new Map();

const featureFolders = {
  meta: {
    type: 'suggestion',
    messages: {
      capExample: `${capLine}${exampleTree}`,
      cap: capLine,
      synonym: '{{folder}} is a shared folder under another name; rename it to src/utils/.',
      utilsImport:
        '{{from}} imports {{to}}, and utils/ sits below every feature folder. Move {{target}} into utils/, or move {{module}} into {{feature}}/.',
      pendingPasses:
        '`{{entry}}` in the `pending` option of zgeoff/feature-folders now passes the rule; remove it from `pending`.',
      pendingMissing:
        '`{{entry}}` in the `pending` option of zgeoff/feature-folders names no package; remove it from `pending`.',
    },
    schema: [
      {
        type: 'object',
        properties: { pending: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.physicalFilename;
    const root = resolveRepoRoot(filename) ?? context.cwd;
    const pending = (context.options[0]?.pending ?? []).map((entry) => toPendingPath(entry));
    const sourcePackage = resolveSourcePackage(filename);
    const isChecked =
      sourcePackage !== null && !pending.includes(toRootPath(root, sourcePackage.directory));

    if (!anchorFiles.has(root)) {
      anchorFiles.set(root, filename);
    }

    const file = { context, filename, root, sourcePackage };
    const visitors =
      isChecked && pickFolderKind(sourcePackage.path.split('/')[0]) === 'utils'
        ? buildUtilsVisitors(file)
        : {};

    return {
      ...visitors,
      Program(program) {
        const start = program.body[0]?.loc.start ?? { line: 1, column: 0 };
        const at = { loc: { start, end: start } };

        if (anchorFiles.get(root) === filename) {
          for (const stale of readStalePending(root, pending, looseModuleLimit)) {
            context.report({ ...at, messageId: stale.messageId, data: { entry: stale.entry } });
          }
        }

        if (isChecked) {
          checkLooseModule(file, at);
          checkSynonymFolder(file, at);
        }
      },
    };
  },
};

export default featureFolders;

function toPendingPath(entry) {
  return posix.normalize(entry).replace(/(?<=.)\/+$/u, '');
}

function toRootPath(root, path) {
  return relative(root, path).split(sep).join('/') || '.';
}

function buildUtilsVisitors(file) {
  const settings = buildImportSettings(file.root);
  const check = (node) => {
    if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
      checkUtilsImport(file, { node, specifier: node.source.value, settings });
    }
  };

  return {
    ImportDeclaration: check,
    ExportNamedDeclaration: check,
    ExportAllDeclaration: check,
    ImportExpression: check,
  };
}

function checkUtilsImport(file, imported) {
  const target = resolveImportTarget(file.filename, imported.specifier, imported.settings);
  const source = join(file.sourcePackage.directory, 'src');

  if (target.kind !== 'file') {
    return;
  }

  const feature = findFeatureFolder(source, target.path);

  if (feature === null) {
    return;
  }

  file.context.report({
    node: imported.node,
    messageId: 'utilsImport',
    data: {
      from: toRootPath(file.root, file.filename),
      to: `src/${toRootPath(source, target.path)}`,
      target: basename(target.path),
      module: basename(file.filename),
      feature,
    },
  });
}

function checkLooseModule(file, at) {
  if (file.sourcePackage.path.includes('/')) {
    return;
  }

  const modules = readLooseModules(file.sourcePackage);
  const name = basename(file.filename);

  if (modules.length <= looseModuleLimit || !modules.includes(name)) {
    return;
  }

  const source = `${toRootPath(file.root, join(file.sourcePackage.directory, 'src'))}/`;

  file.context.report({
    ...at,
    messageId: modules[0] === name ? 'capExample' : 'cap',
    data: { source, count: String(modules.length) },
  });
}

function checkSynonymFolder(file, at) {
  const [folder] = file.sourcePackage.path.split('/');

  if (!file.sourcePackage.path.includes('/') || pickFolderKind(folder) !== 'synonym') {
    return;
  }

  const path = toRootPath(file.root, join(file.sourcePackage.directory, 'src', folder));

  file.context.report({ ...at, messageId: 'synonym', data: { folder: `${path}/` } });
}
