export default function isBunTestFile(program) {
  return program.body.some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.source.value === 'bun:test' &&
      statement.importKind !== 'type' &&
      (statement.specifiers.length === 0 ||
        statement.specifiers.some((specifier) => specifier.importKind !== 'type')),
  );
}
