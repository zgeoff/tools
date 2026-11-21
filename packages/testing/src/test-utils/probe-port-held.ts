import { run } from '../process/index.ts';

const probeSource = `
try {
  Bun.listen({ unix: '\\0zgeoff-testing-port-' + process.argv[1], socket: { data() {} } });
  process.stdout.write('free');
} catch {
  process.stdout.write('held');
}
process.exit(0);
`;

// Tells whether a claim of claimFreePorts holds the port, from a process of its own: it tries to
// take the abstract socket that a claim binds.
export async function probePortHeld(port: number): Promise<boolean> {
  const result = await run([process.execPath, '-e', probeSource, String(port)]);

  return result.stdout === 'held';
}
