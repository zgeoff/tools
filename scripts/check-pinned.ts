// Fails if any dependency in the root catalog or a workspace package.json
// uses a range specifier instead of an exact pin. Workspace-internal
// references (workspace:, catalog:) are exempt.
import { Glob } from "bun";

const EXEMPT = /^(workspace:|catalog:)/;
// exact: optional "v", then digits.digits.digits with optional prerelease/build
const EXACT = /^v?\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

type PackageJson = {
  workspaces?: { catalog?: Record<string, string> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const failures: string[] = [];

function check(source: string, deps: Record<string, string> | undefined) {
  for (const [name, version] of Object.entries(deps ?? {})) {
    if (EXEMPT.test(version)) continue;
    if (!EXACT.test(version)) {
      failures.push(`${source}: ${name}@${version}`);
    }
  }
}

const root = (await Bun.file("package.json").json()) as PackageJson;
check("package.json (catalog)", root.workspaces?.catalog);
check("package.json", root.dependencies);
check("package.json", root.devDependencies);
check("package.json", root.optionalDependencies);

for await (const path of new Glob("packages/*/package.json").scan(".")) {
  const pkg = (await Bun.file(path).json()) as PackageJson;
  check(path, pkg.dependencies);
  check(path, pkg.devDependencies);
  check(path, pkg.optionalDependencies);
}

if (failures.length > 0) {
  console.error("Unpinned dependency versions found:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nPin exact versions (or use catalog:/workspace: references).");
  process.exit(1);
}

console.log("All dependency versions pinned.");
