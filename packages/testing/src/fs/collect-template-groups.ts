// The folder of one template, and the staging and set-aside folders beside it. Its marker and lock
// sit at fixed names beside the folder.
export interface TemplateGroup {
  readonly folder: string;
  readonly leftovers: readonly string[];
}

const entryPattern =
  /^(?<folder>.+-[0-9a-f]{16})(?<suffix>\.used|\.lock|\.staging-.+|\.removing-.+)?$/u;

// Groups the entries of the cache folder by template, and leaves out entries of any other shape.
export function collectTemplateGroups(entries: readonly string[]): readonly TemplateGroup[] {
  const groups = new Map<string, TemplateGroup>();

  for (const entry of entries) {
    const match = entryPattern.exec(entry);
    const folder = match?.groups?.['folder'];

    if (folder === undefined) {
      continue;
    }

    const suffix = match?.groups?.['suffix'];
    const leftovers = groups.get(folder)?.leftovers ?? [];
    const isLeftover = suffix !== undefined && suffix !== '.used' && suffix !== '.lock';

    groups.set(folder, { folder, leftovers: isLeftover ? [...leftovers, entry] : leftovers });
  }

  return [...groups.values()];
}
