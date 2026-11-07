import collectSQLWrites from './collect-sql-writes.js';
import toTableName from './to-table-name.js';

const kyselyWritePattern =
  /\.\s*(?:insertInto|updateTable|deleteFrom)\(\s*(?<quote>['"`])(?<table>[^'"`]+)\k<quote>/gu;

// reads a module as plain text, so a write in a comment counts too
export default function collectWrittenTables(text) {
  const kyselyTables = [...text.matchAll(kyselyWritePattern)].map((match) =>
    toTableName(match.groups.table),
  );

  return [...kyselyTables, ...collectSQLWrites(text)].filter((table) => table !== null);
}
