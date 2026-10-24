import { basename } from 'node:path';
import buildModuleOrderFix from './build-module-order-fix.js';
import collectModuleEntries from './collect-module-entries.js';

const moduleOrder = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    messages: {
      helperFirst:
        "'{{name}}' sits above the primary export '{{primary}}' — move private helpers below it.",
      helperOrder:
        "'{{name}}' breaks composition order — helpers follow the primary export depth-first, so it belongs directly after '{{after}}'.",
      declarationBelowUse:
        "'{{name}}' sits below its first use in '{{user}}' — move it directly above '{{user}}'.",
      declarationAway:
        "'{{name}}' sits away from its first use in '{{user}}' — move it directly above '{{user}}'.",
      declarationLeads:
        "'{{name}}' leads the file, but the primary export does not use it — move it directly above its first use in '{{user}}'.",
    },
    schema: [],
  },
  create(context) {
    return {
      'Program:exit'(program) {
        checkModule(context, program);
      },
    };
  },
};

export default moduleOrder;

function checkModule(context, program) {
  const entries = collectModuleEntries(context, program);
  const primary = findPrimaryExport(entries, context.physicalFilename);

  if (primary === null) {
    return;
  }

  const mainOrder = collectMainOrder(primary);
  const ranks = new Map(mainOrder.map((entry, index) => [entry, index]));
  const homes = buildHomes(entries, ranks);
  const layout = {
    entries,
    primary,
    mainOrder,
    ranks,
    homes,
    collectBlockUsers: (entry) => collectBlockUsers(entry, homes),
  };
  const helperReports = collectHelperReports(layout);
  const reports = [...helperReports, ...collectDeclarationReports(layout, helperReports)];

  if (reports.length === 0) {
    return;
  }

  const plan = buildModuleOrderFix(context, { ...layout, reports });

  for (const report of reports) {
    const fix = plan.moved.has(report.entry) ? { fix: plan.fix } : {};

    context.report({
      node: report.entry.nameNode,
      messageId: report.messageId,
      data: { name: report.entry.name, ...report.data },
      ...fix,
    });
  }
}

function findPrimaryExport(entries, filename) {
  const defaultEntry = entries.find((entry) => entry.exportKind === 'default') ?? null;
  const defaultName =
    defaultEntry?.declaration.type === 'Identifier' ? defaultEntry.declaration.name : null;
  const values = entries.filter(
    (entry) =>
      entry.name !== null &&
      (entry.exportKind !== null || entry.name === defaultName) &&
      (entry.kind === 'function' || entry.declaration.type === 'VariableDeclaration'),
  );

  if (defaultEntry !== null) {
    return values.find((entry) => entry.name === defaultName) ?? defaultEntry;
  }

  const [fileBase] = basename(filename).split('.');
  const named = values.find((entry) => toKebabCase(entry.name) === fileBase);
  const only = values.length === 1 ? values[0] : null;

  return named ?? only;
}

function toKebabCase(name) {
  return name
    .replaceAll(/(?<before>[a-z\d])(?<after>[A-Z])/gu, '$<before>-$<after>')
    .replaceAll(/(?<before>[A-Z]+)(?<after>[A-Z][a-z])/gu, '$<before>-$<after>')
    .toLowerCase();
}

function collectMainOrder(primary) {
  const order = [primary];
  const seen = new Set([primary]);

  const visit = (entry) => {
    for (const use of entry.uses) {
      if (seen.has(use.target)) {
        continue;
      }

      seen.add(use.target);

      if (isHelper(use.target)) {
        order.push(use.target);
        visit(use.target);
      } else if (use.target.kind === 'supporting') {
        visit(use.target);
      }
    }
  };

  visit(primary);

  return order;
}

function isHelper(entry) {
  return entry.kind === 'function' && entry.exportKind === null;
}

function buildHomes(entries, ranks) {
  const homes = new Map();
  const visiting = new Set();

  const findHome = (entry) => {
    if (homes.has(entry) || visiting.has(entry)) {
      return homes.get(entry) ?? null;
    }

    visiting.add(entry);

    let home = null;

    for (const user of entry.users) {
      const candidate = ranks.has(user) ? user : findSupportingHome(user);

      if (candidate !== null && (home === null || ranks.get(candidate) < ranks.get(home))) {
        home = candidate;
      }
    }

    visiting.delete(entry);
    homes.set(entry, home);

    return home;
  };

  const findSupportingHome = (user) => (user.kind === 'supporting' ? findHome(user) : null);

  for (const entry of entries) {
    if (entry.kind === 'supporting' && !ranks.has(entry)) {
      findHome(entry);
    }
  }

  return homes;
}

function collectBlockUsers(entry, homes) {
  const home = homes.get(entry);

  return [...entry.users].filter((user) => user === home || homes.get(user) === home);
}

function collectHelperReports(layout) {
  const primary = layout.primary;
  const reports = [];

  for (const entry of layout.entries) {
    if (isHelper(entry) && entry.index < primary.index) {
      reports.push({ entry, messageId: 'helperFirst', data: { primary: primary.name } });
    }
  }

  const mainOrder = layout.mainOrder;
  const ranks = layout.ranks;
  const below = mainOrder
    .filter((entry) => entry.index > primary.index)
    .toSorted((first, second) => first.index - second.index);
  const kept = collectLongestRun(below.map((entry) => ranks.get(entry)));

  for (const [position, entry] of below.entries()) {
    if (!kept.has(position)) {
      const after = mainOrder[ranks.get(entry) - 1].name;

      reports.push({ entry, messageId: 'helperOrder', data: { after } });
    }
  }

  return reports;
}

function collectLongestRun(values) {
  const lengths = values.map(() => 1);
  const previous = values.map(() => -1);

  for (let current = 0; current < values.length; current++) {
    for (let earlier = 0; earlier < current; earlier++) {
      if (values[earlier] < values[current] && lengths[earlier] + 1 > lengths[current]) {
        lengths[current] = lengths[earlier] + 1;
        previous[current] = earlier;
      }
    }
  }

  const kept = new Set();
  let position = lengths.indexOf(Math.max(...lengths));

  while (position !== -1) {
    kept.add(position);
    position = previous[position];
  }

  return kept;
}

function collectDeclarationReports(layout, helperReports) {
  const homes = layout.homes;
  const moving = new Set(helperReports.map((report) => report.entry));
  const staying = layout.mainOrder.filter((entry) => !moving.has(entry));
  const reports = [];

  for (const entry of layout.entries) {
    const home = homes.get(entry) ?? null;

    // load-time code can call a live function before a const below the primary
    // export is set, so a const that a live function reads stays unchecked
    if (home === null || (hasValue(entry) && isReadByLiveFunction(entry))) {
      continue;
    }

    const users = collectBlockUsers(entry, homes);
    const usersAbove = [...users, home].filter((user) => user.index < entry.index);
    const isAbove = usersAbove.length === 0;
    const named = isAbove ? users : usersAbove;
    const firstUser = named.reduce((first, user) => (user.index < first.index ? user : first));
    const hasHelperBetween = staying.some(
      (main) => main.index > entry.index && main.index < home.index,
    );

    if (!isAbove || hasHelperBetween) {
      const messageId = pickDeclarationMessage({ entry, home, primary: layout.primary, isAbove });

      reports.push({ entry, messageId, data: { user: firstUser.name } });
    }
  }

  return reports;
}

function hasValue(entry) {
  const type = entry.declaration.type;

  return type !== 'TSTypeAliasDeclaration' && type !== 'TSInterfaceDeclaration';
}

function isReadByLiveFunction(entry) {
  return entry.references.some(
    (reference) =>
      reference.source !== null &&
      reference.source !== entry &&
      reference.source.isLive &&
      !reference.isLoadTime,
  );
}

function pickDeclarationMessage(placement) {
  if (!placement.isAbove) {
    return 'declarationBelowUse';
  }

  const isLeading =
    placement.home !== placement.primary && placement.entry.index < placement.primary.index;

  return isLeading ? 'declarationLeads' : 'declarationAway';
}
