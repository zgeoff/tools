import type { FileReport } from './types.ts';

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
