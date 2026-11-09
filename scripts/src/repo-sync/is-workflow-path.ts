export function isWorkflowPath(path: string): boolean {
  return path.startsWith('.github/workflows/');
}
