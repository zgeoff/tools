import { collectFolderFaults } from './collect-folder-faults.ts';
import { collectImportFaults } from './collect-import-faults.ts';
import { collectNameFaults } from './collect-name-faults.ts';
import type { OxcParserModule } from './oxc-parser-module.ts';
import type { SourceFile, TestLayout } from './types.ts';

export function collectTestLayoutFaults(
  oxc: OxcParserModule,
  layout: TestLayout,
  sources: readonly SourceFile[],
): string[] {
  return [
    ...collectFolderFaults(layout),
    ...collectNameFaults(layout),
    ...collectImportFaults(oxc, layout, sources),
  ];
}
