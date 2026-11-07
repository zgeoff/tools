import { tablePattern } from './collect-sql-writes.js';
import toTableName from './to-table-name.js';

const createTablePattern = new RegExp(
  String.raw`\bcreate\s+(?:(?:temp|temporary|virtual)\s+)?table\s+(?:if\s+not\s+exists\s+)?${tablePattern}`,
  'giu',
);

export default function collectCreatedTables(text) {
  return [...text.matchAll(createTablePattern)]
    .map((match) => toTableName(match.groups.table))
    .filter((table) => table !== null);
}
