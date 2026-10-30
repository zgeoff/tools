import { expect, test } from 'bun:test';
import { buildCopyPlan } from './build-copy-plan.ts';

test('it copies each taken file and pins only a workflow target', () => {
  const plan = buildCopyPlan({
    rows: [
      { action: 'copy', source: 'sync/editorconfig', target: '.editorconfig', mode: '0644' },
      {
        action: 'copy',
        source: 'sync/workflow-callers/pr.yml',
        target: '.github/workflows/pr.yml',
        mode: '0644',
      },
    ],
    existingWorkflows: new Map(),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan).toStrictEqual({
    copies: [
      { source: 'sync/editorconfig', target: '.editorconfig', mode: '0644', isPinned: false },
      {
        source: 'sync/workflow-callers/pr.yml',
        target: '.github/workflows/pr.yml',
        mode: '0644',
        isPinned: true,
      },
    ],
    conflicts: [],
    excluded: [],
    strippedTargets: [],
  });
});

test('it strips the excluded blocks from each copied Markdown file when the caller skips a file', () => {
  const plan = buildCopyPlan({
    rows: [
      { action: 'copy', source: 'sync/skills/kettle/SKILL.md', target: 'SKILL.md', mode: '0644' },
      { action: 'copy', source: 'sync/skills/kettle/boil.sh', target: 'boil.sh', mode: '0755' },
      { action: 'skip', source: 'sync/skills/kettle/pour.md', target: 'pour.md', mode: '0644' },
    ],
    existingWorkflows: new Map(),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan).toStrictEqual({
    copies: [
      { source: 'sync/skills/kettle/SKILL.md', target: 'SKILL.md', mode: '0644', isPinned: false },
      { source: 'sync/skills/kettle/boil.sh', target: 'boil.sh', mode: '0755', isPinned: false },
    ],
    conflicts: [],
    excluded: ['pour.md'],
    strippedTargets: ['SKILL.md'],
  });
});

test('it strips no Markdown file when the caller skips nothing', () => {
  const plan = buildCopyPlan({
    rows: [
      { action: 'copy', source: 'sync/skills/kettle/SKILL.md', target: 'SKILL.md', mode: '0644' },
    ],
    existingWorkflows: new Map(),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan.strippedTargets).toStrictEqual([]);
});

test('it reports a workflow the repo wrote itself as a conflict and copies the rest', () => {
  const plan = buildCopyPlan({
    rows: [
      { action: 'copy', source: 'sync/editorconfig', target: '.editorconfig', mode: '0644' },
      {
        action: 'copy',
        source: 'sync/workflow-callers/pr.yml',
        target: '.github/workflows/pr.yml',
        mode: '0644',
      },
    ],
    existingWorkflows: new Map([
      [
        '.github/workflows/pr.yml',
        {
          targetText: 'jobs:\n  lint:\n    runs-on: ubuntu-latest\n',
          sourceText:
            'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main\n',
        },
      ],
    ]),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan).toStrictEqual({
    copies: [
      { source: 'sync/editorconfig', target: '.editorconfig', mode: '0644', isPinned: false },
    ],
    conflicts: ['.github/workflows/pr.yml'],
    excluded: [],
    strippedTargets: [],
  });
});

test('it overwrites a workflow that holds the marker line', () => {
  const plan = buildCopyPlan({
    rows: [
      {
        action: 'copy',
        source: 'sync/workflow-callers/pr.yml',
        target: '.github/workflows/pr.yml',
        mode: '0644',
      },
    ],
    existingWorkflows: new Map([
      [
        '.github/workflows/pr.yml',
        {
          targetText: '# repo-sync delivers this file from zgeoff/tools\njobs: {}\n',
          sourceText: 'jobs: {}\n',
        },
      ],
    ]),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan.conflicts).toStrictEqual([]);
});

test('it overwrites a workflow of the repo that calls the same shared workflow as the source', () => {
  const plan = buildCopyPlan({
    rows: [
      {
        action: 'copy',
        source: 'sync/workflow-callers/pr.yml',
        target: '.github/workflows/pr.yml',
        mode: '0644',
      },
    ],
    existingWorkflows: new Map([
      [
        '.github/workflows/pr.yml',
        {
          targetText:
            'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@0123456789abcdef0123456789abcdef01234567 # main\n',
          sourceText:
            'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main\n',
        },
      ],
    ]),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan.conflicts).toStrictEqual([]);
});

test('it reports a conflict for a repo workflow when the source calls no shared workflow', () => {
  const plan = buildCopyPlan({
    rows: [
      {
        action: 'copy',
        source: 'sync/workflow-callers/lint.yml',
        target: '.github/workflows/lint.yml',
        mode: '0644',
      },
    ],
    existingWorkflows: new Map([
      [
        '.github/workflows/lint.yml',
        { targetText: 'jobs: {}\n', sourceText: 'jobs:\n  lint:\n    runs-on: ubuntu-latest\n' },
      ],
    ]),
    marker: 'repo-sync delivers this file from zgeoff/tools',
  });

  expect(plan.conflicts).toStrictEqual(['.github/workflows/lint.yml']);
});
