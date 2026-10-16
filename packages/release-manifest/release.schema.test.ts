import { expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './release.schema.json' with { type: 'json' };

// strict mode makes Ajv reject an unknown keyword or a type mismatch in the schema itself
function setupTest() {
  return { validate: new Ajv2020({ allErrors: true, strict: true }).compile(schema) };
}

test('it accepts a manifest with images, sandbox images, migrations and a config schema', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '3.4.0',
    tag: 'v3.4.0',
    commit: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
    images: {
      server: `ghcr.io/example/lantern:3.4.0@sha256:${'a1'.repeat(32)}`,
      web: `ghcr.io/example/lantern-web:3.4.0@sha256:${'b2'.repeat(32)}`,
    },
    sandboxImages: {
      worker: `ghcr.io/example/lantern-worker:3.4.0@sha256:${'c3'.repeat(32)}`,
    },
    migrations: {
      since: 'v3.3.1',
      added: [{ version: 12, name: 'add_lamp_wattage' }],
      readableByReleaseBefore: true,
    },
    configSchema: { asset: 'config.schema.json', since: 'v3.3.1', breaking: [] },
  });

  expect(ctx.validate.errors).toBeNull();
  expect(valid).toBeTrue();
});

test('it accepts a first release whose migrations and config schema have no release before', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '0.1.0',
    tag: 'v0.1.0',
    commit: '1234567890abcdef1234567890abcdef12345678',
    migrations: {
      since: null,
      added: [{ version: 1, name: 'create_lamps' }],
      readableByReleaseBefore: null,
    },
    configSchema: { asset: 'config.schema.json', since: null, breaking: [] },
  });

  expect(ctx.validate.errors).toBeNull();
  expect(valid).toBeTrue();
});

test('it accepts a manifest with only the required fields and a scoped package tag', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '2.0.0-rc.1',
    tag: '@example/lamp-cli@2.0.0-rc.1',
    commit: 'fedcba9876543210fedcba9876543210fedcba98',
  });

  expect(ctx.validate.errors).toBeNull();
  expect(valid).toBeTrue();
});

test('it accepts an image on a registry with a port and no tag', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    images: { relay: `registry.example.test:5000/ops/relay@sha256:${'d4'.repeat(32)}` },
  });

  expect(ctx.validate.errors).toBeNull();
  expect(valid).toBeTrue();
});

test('it rejects a manifest without a commit', () => {
  const ctx = setupTest();
  const valid = ctx.validate({ format: 1, version: '1.0.0', tag: 'v1.0.0' });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '',
    keyword: 'required',
    params: { missingProperty: 'commit' },
  });
});

test('it rejects an abbreviated commit', () => {
  const ctx = setupTest();
  const valid = ctx.validate({ format: 1, version: '1.0.0', tag: 'v1.0.0', commit: 'abc1234' });

  expect(valid).toBeFalse();
  expect(ctx.validate.errors).toPartiallyContain({ instancePath: '/commit', keyword: 'pattern' });
});

test('it rejects a version with a leading v', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: 'v1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
  });

  expect(valid).toBeFalse();
  expect(ctx.validate.errors).toPartiallyContain({ instancePath: '/version', keyword: 'pattern' });
});

test('it rejects a format other than 1', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 2,
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
  });

  expect(valid).toBeFalse();
  expect(ctx.validate.errors).toPartiallyContain({ instancePath: '/format', keyword: 'const' });
});

test('it rejects an image pinned only by tag', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    images: { server: 'ghcr.io/example/lantern:1.0.0' },
  });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/images/server',
    keyword: 'pattern',
  });
});

test('it rejects an empty image map', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    images: {},
  });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/images',
    keyword: 'minProperties',
  });
});

test('it rejects a field that the schema does not name', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    channel: 'stable',
  });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '',
    keyword: 'additionalProperties',
    params: { additionalProperty: 'channel' },
  });
});

test('it rejects a migration without a name', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.1.0',
    tag: 'v1.1.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    migrations: { since: 'v1.0.0', added: [{ version: 3 }], readableByReleaseBefore: false },
  });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/migrations/added/0',
    keyword: 'required',
    params: { missingProperty: 'name' },
  });
});

test('it rejects a config schema asset that names a path', () => {
  const ctx = setupTest();

  const valid = ctx.validate({
    format: 1,
    version: '1.1.0',
    tag: 'v1.1.0',
    commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    configSchema: { asset: 'schemas/config.schema.json', since: 'v1.0.0', breaking: [] },
  });

  expect(valid).toBeFalse();

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/configSchema/asset',
    keyword: 'pattern',
  });
});
