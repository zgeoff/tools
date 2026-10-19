import makeGlobMatcher from './make-glob-matcher.js';

const loadedOptions = new Map();

// oxlint hands each file its own copy of the options, so the compiled form is
// keyed by content
export default function getZoneOptions(options) {
  const key = JSON.stringify(options);
  let loaded = loadedOptions.get(key);

  if (loaded === undefined) {
    loaded = buildZoneOptions(options);

    loadedOptions.set(key, loaded);
  }

  return loaded;
}

const defaultExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

function buildZoneOptions(options) {
  const globsByZone = options.zones ?? {};
  const zones = Object.keys(globsByZone).map((name) => ({
    name,
    match: makeGlobMatcher(globsByZone[name]),
  }));

  return {
    zones,
    extensions: options.extensions ?? defaultExtensions,
    conditions: new Set([...(options.conditions ?? []), 'default']),
    workspaces: options.workspaces ?? [],
    edges: buildEntries(options.edges),
    modules: buildEntries(options.modules),
    globals: buildEntries(options.globals),
    unzoned: buildEntries(options.unzoned),
    unresolved: buildEntries(options.unresolved),
    selfImports: buildEntries(options.selfImports),
  };
}

function buildEntries(entries) {
  return (entries ?? []).map((entry) => buildEntry(entry));
}

function buildEntry(entry) {
  return {
    ...entry,
    ignore: makeGlobMatcher(entry.ignore ?? []),
    typeOnlyTargets: Array.isArray(entry.allowTypeOnly)
      ? makeGlobMatcher(entry.allowTypeOnly)
      : null,
    within: entry.allowWithin === undefined ? null : makeWithinMatcher(entry.allowWithin),
  };
}

// `src/*` keeps an import inside the importer's own `src/<name>/` directory
function makeWithinMatcher(glob) {
  const depth = glob.split('/').length;
  const match = makeGlobMatcher([glob]);

  return (from, to) => {
    const prefix = from.split('/').slice(0, depth).join('/');

    return match(prefix) && to.split('/').slice(0, depth).join('/') === prefix;
  };
}
