import toTableName from './to-table-name.js';

export const tablePattern = String.raw`(?<table>[^\s(),;'\x60]+)`;

const sqlWritePatterns = [
  new RegExp(String.raw`\binsert\s+(?:or\s+[a-z]+\s+)?into\s+${tablePattern}`, 'giu'),
  new RegExp(String.raw`(?<!\bor\s+)\breplace\s+into\s+${tablePattern}`, 'giu'),
  new RegExp(
    String.raw`\bupdate\s+(?:or\s+[a-z]+\s+)?${tablePattern}(?:\s+(?:as\s+)?\w+)?\s+set\b`,
    'giu',
  ),
  new RegExp(String.raw`\bdelete\s+from\s+${tablePattern}`, 'giu'),
];

export default function collectSQLWrites(text) {
  return sqlWritePatterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => toTableName(match.groups.table)),
  );
}
