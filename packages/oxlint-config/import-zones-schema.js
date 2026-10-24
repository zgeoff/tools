const stringList = { type: 'array', items: { type: 'string' } };

const importZonesSchema = {
  type: 'object',
  properties: {
    zones: { type: 'object', additionalProperties: stringList },
    extensions: stringList,
    conditions: stringList,
    workspaces: stringList,
    edges: buildEntrySchema(
      {
        to: stringList,
        allow: stringList,
        allowTypeOnly: { anyOf: [{ type: 'boolean' }, stringList] },
        allowWithin: { type: 'string' },
      },
      ['from'],
      [{ required: ['to'] }, { required: ['allow'] }],
    ),
    modules: buildEntrySchema(
      { modules: stringList, allow: stringList, allowTypeOnly: { type: 'boolean' } },
      ['modules', 'allow'],
    ),
    globals: buildEntrySchema({ globals: stringList, allow: stringList }, ['globals', 'allow']),
    unzoned: buildEntrySchema({ zones: stringList }, ['from', 'zones']),
    unresolved: buildEntrySchema({}, []),
    selfImports: buildEntrySchema({}, []),
  },
  additionalProperties: false,
};

export default importZonesSchema;

function buildEntrySchema(properties, required, anyOf) {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        from: stringList,
        ignore: stringList,
        reason: { type: 'string' },
        ...properties,
      },
      required: ['name', ...required],
      additionalProperties: false,
      ...(anyOf === undefined ? {} : { anyOf }),
    },
  };
}
