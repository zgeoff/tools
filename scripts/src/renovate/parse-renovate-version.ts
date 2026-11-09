export type RenovateVersionResult =
  | { readonly kind: 'parsed'; readonly version: string }
  | { readonly kind: 'invalid'; readonly message: string };

// npx installs renovate@<version>, so only an exact release reads the preset as the scheduled run
// does.
const exactVersionPattern = /^\d+\.\d+\.\d+$/u;

// The validator runs at the Renovate version the scheduled run pins, so it reads the preset as
// that run does.
export function parseRenovateVersion(workflowText: string): RenovateVersionResult {
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const steps = findMember(findMember(findMember(workflow, 'jobs'), 'renovate'), 'steps');

  const versions = (Array.isArray(steps) ? steps : []).flatMap((step: unknown) => {
    const version = findMember(findMember(step, 'with'), 'renovate-version');

    return typeof version === 'string' ? [version] : [];
  });

  const [version] = versions;

  if (version === undefined || versions.length > 1) {
    return {
      kind: 'invalid',
      message: `the renovate job holds ${versions.length} renovate-version inputs; the check reads exactly one`,
    };
  }

  if (!exactVersionPattern.test(version)) {
    return {
      kind: 'invalid',
      message: `the renovate-version input is '${version}', not an exact release such as 44.1.0`,
    };
  }

  return { kind: 'parsed', version };
}

function findMember(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const members: [string, unknown][] = Object.entries(value);

  return members.find(([name]) => name === key)?.[1];
}
