export default function makeGlobMatcher(globs) {
  const patterns = globs.map((glob) => toGlobRegExp(glob));

  return (path) => patterns.some((pattern) => pattern.test(path));
}

const braceGroup = /(?<group>\{[^{}]*\})/u;

function toGlobRegExp(glob) {
  const source = glob
    .split(braceGroup)
    .map((part) => (braceGroup.test(part) ? toAlternativesSource(part) : toGlobSource(part)))
    .join('');

  return new RegExp(`^${source}$`, 'u');
}

function toAlternativesSource(group) {
  const alternatives = group
    .slice(1, -1)
    .split(',')
    .map((part) => toGlobSource(part));

  return `(?:${alternatives.join('|')})`;
}

const globTokenSources = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' };

function toGlobSource(text) {
  return text.replaceAll(
    /\*\*\/|\*\*|\*|\?|[$()+.[\\\]^{|}]/gu,
    (token) => globTokenSources[token] ?? `\\${token}`,
  );
}
