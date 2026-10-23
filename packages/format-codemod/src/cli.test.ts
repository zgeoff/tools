import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it exits cleanly in check mode when files are already padded', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'clean.ts');

  fs.writeFileSync(file, 'const a = 1;\n\nexport function f() {\n  return a;\n}\n');

  const status = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', file],
    { encoding: 'utf8' },
  ).status;

  expect(status).toBe(0);
});

test('it exits with the diff code in check mode when a file needs padding and leaves it unmodified', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'unpadded.ts');
  const source = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.writeFileSync(file, source);

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', file],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(1);
  expect(stderr).toInclude('DIFF');
  expect(fs.readFileSync(file, 'utf8')).toBe(source);
});

test('it fails the batch in check mode when a file cannot be parsed', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'broken.ts');

  fs.writeFileSync(file, 'const = (((\n');

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', file],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude('PARSE-ERR');
});

test('it fails the batch when a named file does not exist', () => {
  const ctx = setupTest();
  const missing = path.join(ctx.directory, 'missing.ts');

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', missing],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude('ERROR');
});

test('it still checks the remaining files after one fails to parse', () => {
  const ctx = setupTest();
  const broken = path.join(ctx.directory, 'a-broken.ts');
  const unpadded = path.join(ctx.directory, 'b-unpadded.ts');

  fs.writeFileSync(broken, 'const = (((\n');
  fs.writeFileSync(unpadded, 'export function f() {\n  const a = 1;\n  return a;\n}\n');

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', broken, unpadded],
    { encoding: 'utf8' },
  );

  expect(result.status).toBe(2);
  expect(result.stderr).toInclude('PARSE-ERR');
  expect(result.stderr).toInclude('DIFF');
});

test('it rejects an unknown flag with a usage error and leaves files untouched', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'unpadded.ts');
  const source = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.writeFileSync(file, source);

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--chekc', file],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude('Unknown option: --chekc');
  expect(fs.readFileSync(file, 'utf8')).toBe(source);
});

test('it formats .tsx files containing JSX', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'component.tsx');

  fs.writeFileSync(file, 'const el = <div>hi</div>;\nexport function C() {\n  return el;\n}\n');

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', file],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(1);
  expect(stderr).toInclude('DIFF');
});

test('it processes a file only once when patterns overlap', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'unpadded.ts');

  fs.writeFileSync(file, 'export function f() {\n  const a = 1;\n  return a;\n}\n');

  const stderr = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', ctx.directory, file],
    { encoding: 'utf8' },
  ).stderr;

  expect(stderr.match(/DIFF/gu)).toHaveLength(1);
});

test('it prints the package version for --version', () => {
  const result = spawnSync(process.execPath, [path.join(import.meta.dir, 'cli.ts'), '--version'], {
    encoding: 'utf8',
  });

  const status = result.status;
  const stdout = result.stdout;

  expect(status).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('it only reports files that would change in quiet mode', () => {
  const ctx = setupTest();

  fs.writeFileSync(path.join(ctx.directory, 'clean.ts'), 'const a = 1;\n\nuse(a);\n');
  fs.writeFileSync(path.join(ctx.directory, 'unpadded.ts'), 'const a = 1;\nuse(a);\n');

  const stderr = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', '--quiet', ctx.directory],
    { encoding: 'utf8' },
  ).stderr;

  expect(stderr).toInclude('DIFF');
  expect(stderr).not.toInclude('OK ');
});

test('it does not descend into node_modules when expanding a directory', () => {
  const ctx = setupTest();
  const nested = path.join(ctx.directory, 'node_modules', 'dep');

  fs.mkdirSync(nested, { recursive: true });

  fs.writeFileSync(
    path.join(nested, 'unpadded.ts'),
    'export function f() {\n  const a = 1;\n  return a;\n}\n',
  );

  fs.writeFileSync(
    path.join(ctx.directory, 'clean.ts'),
    'const a = 1;\n\nexport function f() {\n  return a;\n}\n',
  );

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', ctx.directory],
    { encoding: 'utf8' },
  );

  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(0);
  expect(stderr).not.toInclude('node_modules');
});

test('it skips files matching --ignore globs', () => {
  const ctx = setupTest();
  const generated = path.join(ctx.directory, 'generated');
  const unpadded = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.mkdirSync(generated);
  fs.writeFileSync(path.join(generated, 'out.ts'), unpadded);

  fs.writeFileSync(
    path.join(ctx.directory, 'clean.ts'),
    'const a = 1;\n\nexport function f() {\n  return a;\n}\n',
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dir, 'cli.ts'),
      '--check',
      '--ignore',
      path.join(ctx.directory, 'generated/**'),
      ctx.directory,
    ],
    { encoding: 'utf8' },
  );

  expect(result.status).toBe(0);
  expect(result.stderr).not.toInclude('generated');
  expect(fs.readFileSync(path.join(generated, 'out.ts'), 'utf8')).toBe(unpadded);
});

test('it skips files matching globs from a .formatignore in the working directory', () => {
  const ctx = setupTest();
  const unpadded = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.mkdirSync(path.join(ctx.directory, 'generated'));
  fs.writeFileSync(path.join(ctx.directory, 'generated/out.ts'), unpadded);
  fs.writeFileSync(path.join(ctx.directory, '.formatignore'), '# codegen\ngenerated/**\n');

  fs.writeFileSync(
    path.join(ctx.directory, 'clean.ts'),
    'const a = 1;\n\nexport function f() {\n  return a;\n}\n',
  );

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', '.'],
    { encoding: 'utf8', cwd: ctx.directory },
  );

  expect(result.status).toBe(0);
  expect(result.stderr).not.toInclude('generated');
});

test('it merges .formatignore globs with --ignore flags', () => {
  const ctx = setupTest();
  const unpadded = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.mkdirSync(path.join(ctx.directory, 'generated'));
  fs.mkdirSync(path.join(ctx.directory, 'vendored'));
  fs.writeFileSync(path.join(ctx.directory, 'generated/out.ts'), unpadded);
  fs.writeFileSync(path.join(ctx.directory, 'vendored/dep.ts'), unpadded);
  fs.writeFileSync(path.join(ctx.directory, '.formatignore'), 'generated/**\n');

  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dir, 'cli.ts'), '--check', '--ignore', 'vendored/**', '.'],
    { encoding: 'utf8', cwd: ctx.directory },
  );

  expect(result.status).toBe(2);
  expect(result.stderr).toInclude('no files matched');
});
