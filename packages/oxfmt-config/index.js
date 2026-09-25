const config = {
  ignorePatterns: ['bun.lock', 'agents/shared.md', 'AGENTS.md'],
  proseWrap: 'always',
  semi: true,
  trailingComma: 'all',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: 'always',
  sortImports: {
    groups: [
      'side_effect',
      'test-libs',
      'builtin',
      'external',
      'unknown',
      ['parent', 'sibling', 'index'],
    ],
    customGroups: [
      {
        groupName: 'test-libs',
        elementNamePattern: ['bun:test', '@testing-library/**'],
      },
    ],
    newlinesBetween: false,
    sortSideEffects: false,
  },
};

export default config;
