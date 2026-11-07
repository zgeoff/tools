import toTableName from './to-table-name.js';

// upper case only, so prose such as a test title that says "update" never reads as SQL
const sqlWritePatterns = [
  /\bINSERT\s+(?:OR\s+[A-Z]+\s+)?INTO\s+(?<table>[^\s(),;'`]+)/gu,
  /\bUPDATE\s+(?:OR\s+[A-Z]+\s+)?(?<table>[^\s(),;'`]+)\s+SET\b/gu,
  /\bDELETE\s+FROM\s+(?<table>[^\s(),;'`]+)/gu,
];

export default function collectSQLWrites(text) {
  return sqlWritePatterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => toTableName(match.groups.table)),
  );
}
