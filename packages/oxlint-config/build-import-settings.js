const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export default function buildImportSettings(root) {
  return { root, extensions, conditions: new Set(['default']), workspaces: [] };
}
