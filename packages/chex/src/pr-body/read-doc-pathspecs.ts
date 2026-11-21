import { readFileSync } from 'node:fs';

export interface DocPathspecs {
  // The READMEs, which the prose check lists one by one and keeps out of the skill folders.
  readonly readmes: readonly string[];

  // The docs and skill Markdown.
  readonly docs: readonly string[];
}

const pathspec = /'(?<spec>:\([^']*\)[^']*)'/gu;

// Reads the pathspecs that check-prose.sh uses when it gets no path, from the script itself, so the
// two lists cannot drift apart.
export function parseDocPathspecs(script: string): DocPathspecs {
  const start = script.indexOf('if [ "$#" -eq 0 ]; then');
  const end = script.indexOf('\nfi\n', start);
  const block = start === -1 || end === -1 ? '' : script.slice(start, end);
  const readmeEnd = block.indexOf('); then');
  const readmeBlock = block.slice(0, readmeEnd + 1);
  const docBlock = block.slice(readmeEnd + 1);
  const readmes = [...readmeBlock.matchAll(pathspec)].map((match) => match.groups?.['spec'] ?? '');
  const docs = [...docBlock.matchAll(pathspec)].map((match) => match.groups?.['spec'] ?? '');

  if (readmes.length === 0 || docs.length === 0) {
    throw new Error('check-prose.sh no longer lists the pathspecs in the form pr-body reads');
  }

  return { readmes, docs };
}

export function readDocPathspecs(): DocPathspecs {
  return parseDocPathspecs(
    readFileSync(new URL('../docs/check-prose.sh', import.meta.url), 'utf8'),
  );
}
