// The static job and the private checks job run the checks that need the tools. A test job needs
// one only when its caller asks, for a suite whose tests run it.
export function shouldInstallTool(part: string, requested: string): boolean {
  return requested === 'true' || part === 'static' || part === 'all';
}
