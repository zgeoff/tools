import { collectSVGElements, parseSVG } from '../utils/parse-svg.ts';
import type { SVGElementInfo } from '../utils/parse-svg.ts';
import { ALLOWED_ATTRIBUTES } from './allowed-attributes.ts';

export type SceneRule = 'allow-list' | 'style' | 'links' | 'size' | 'hex-colour' | 'stale';

export interface SceneProblem {
  readonly rule: SceneRule;
  readonly message: string;
}

export interface NamedText {
  readonly path: string;
  readonly text: string;
}

export interface SceneCheckInput {
  // The scene's committed SVG files.
  readonly files: readonly NamedText[];

  // The source files of the scene's folder.
  readonly sources: readonly NamedText[];

  // What `storyboard build` would write, for each committed file.
  readonly built: readonly NamedText[];
}

const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/u;

// The pure part of the unit suite: reads each committed file and each source, and says which
// rules they break.
export function collectSceneProblems(input: SceneCheckInput): SceneProblem[] {
  return [
    ...input.files.flatMap((file) => collectFileProblems(file)),
    ...input.sources
      .filter((source) => !source.path.endsWith('tokens.ts') && HEX_COLOUR.test(source.text))
      .map((source) => ({
        rule: 'hex-colour' as const,
        message: `${source.path} holds a hex colour, and only tokens.ts may`,
      })),
    ...collectStaleProblems(input),
  ];
}

export const MAX_FILE_BYTES = 150_000;

function collectFileProblems(file: NamedText): SceneProblem[] {
  const problems: SceneProblem[] = [];
  const bytes = Buffer.byteLength(file.text);

  if (bytes > MAX_FILE_BYTES) {
    problems.push({
      rule: 'size',
      message: `${file.path} is ${bytes} bytes, over ${MAX_FILE_BYTES}`,
    });
  }

  let elements: SVGElementInfo[];

  try {
    elements = collectSVGElements(parseSVG(file.text));
  } catch (error) {
    return [
      ...problems,
      {
        rule: 'allow-list',
        message: `${file.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  for (const element of elements) {
    problems.push(...collectElementProblems(file.path, element));
  }

  return problems;
}

function collectElementProblems(path: string, element: SVGElementInfo): SceneProblem[] {
  const allowed = ALLOWED_ATTRIBUTES.get(element.tag);
  const problems: SceneProblem[] = [];

  if (element.tag.toLowerCase() === 'script') {
    problems.push({ rule: 'links', message: `${path} holds a <script>` });
  }

  if (allowed === undefined) {
    problems.push({
      rule: 'allow-list',
      message: `${path} uses <${element.tag}>, which is not allowed`,
    });
  }

  for (const [name, value] of Object.entries(element.attributes)) {
    problems.push(...collectAttributeProblems({ path, tag: element.tag, name, value }, allowed));
  }

  if (element.tag === 'style') {
    problems.push(...collectStyleProblems(path, element));
  }

  return problems;
}

const SAME_FILE_LINK = /^#\S+$/u;

interface AttributeSite {
  readonly path: string;
  readonly tag: string;
  readonly name: string;
  readonly value: string;
}

function collectAttributeProblems(
  site: AttributeSite,
  allowed: readonly string[] | undefined,
): SceneProblem[] {
  const problems: SceneProblem[] = [];

  if (/^on/iu.test(site.name)) {
    problems.push({
      rule: 'links',
      message: `${site.path} has the attribute ${site.name} on <${site.tag}>`,
    });
  }

  if (/^(?:xlink:)?href$/iu.test(site.name) && !SAME_FILE_LINK.test(site.value)) {
    problems.push({
      rule: 'links',
      message: `${site.path} has an href to "${site.value}" on <${site.tag}>`,
    });
  }

  problems.push(...collectURLProblems(site.path, `<${site.tag} ${site.name}>`, site.value));

  if (allowed !== undefined && !allowed.includes(site.name)) {
    problems.push({
      rule: 'allow-list',
      message: `${site.path} uses the attribute ${site.name} on <${site.tag}>, which is not allowed`,
    });
  }

  return problems;
}

const URL_CALL = /url\(\s*(?<target>[^)]*)\)/giu;

function collectURLProblems(path: string, where: string, text: string): SceneProblem[] {
  return [...text.matchAll(URL_CALL)].flatMap((call) => {
    const target = (call.groups?.['target'] ?? '').trim().replaceAll(/^["']|["']$/gu, '');

    return SAME_FILE_LINK.test(target)
      ? []
      : [
          {
            rule: 'links' as const,
            message: `${path} has url(${target}) in ${where}, which leaves the file`,
          },
        ];
  });
}

function collectStyleProblems(path: string, style: SVGElementInfo): SceneProblem[] {
  const css = style.children.filter((child) => typeof child === 'string').join('');
  const problems: SceneProblem[] = [];

  if (css.includes('@')) {
    problems.push({ rule: 'style', message: `${path} has an @ rule in its <style>` });
  }

  if (/url\s*\(/iu.test(css)) {
    problems.push({ rule: 'style', message: `${path} has a url() in its <style>` });
  }

  if (/(?:^|[\s;{])(?:animation|transition)[\w-]*\s*:/iu.test(css)) {
    problems.push({
      rule: 'style',
      message: `${path} has an animation or transition property in its <style>`,
    });
  }

  return problems;
}

function collectStaleProblems(input: SceneCheckInput): SceneProblem[] {
  return input.built.flatMap((built) => {
    const committed = input.files.find((file) => file.path === built.path);

    return committed?.text === built.text
      ? []
      : [
          {
            rule: 'stale' as const,
            message: `${built.path} differs from what storyboard build writes${committed === undefined ? ' (it is missing)' : ''}`,
          },
        ];
  });
}
