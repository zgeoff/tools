import type { FileReport } from './types.ts';

/**
 * Prints one file's outcome: the stdout payload (--dry diffs) to stdout,
 * messages and per-file progress to stderr. Quiet drops the OK/SKIP noise but
 * never the messages.
 */
export function printReport(file: string, report: FileReport, quiet: boolean): void {
  if (report.stdout !== null) {
    process.stdout.write(report.stdout);
  }

  if (report.message !== null) {
    console.error(report.message);
  }

  if (!quiet && report.outcome === 'ok') {
    console.error(`OK    ${file}`);
  }

  if (!quiet && report.outcome === 'skipped') {
    console.error(`SKIP  ${file}  declaration file`);
  }
}
