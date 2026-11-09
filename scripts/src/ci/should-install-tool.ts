// The static job and the private checks job run the checks that need a check tool. A test job needs
// one only when its caller asks, for a suite whose tests run it. A tool that no check runs installs
// only when the caller asks.
export function shouldInstallTool(part: string, requested: string, checkTool: boolean): boolean {
  return requested === 'true' || (checkTool && (part === 'static' || part === 'all'));
}
