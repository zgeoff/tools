// Its first argument picks what it does: echo, exit, env, serve (listens on PORT, answers /health
// with 200 and the rest with 404, exits 0 on SIGTERM) or mute (does nothing until SIGTERM).
const [mode, ...rest] = process.argv.slice(2);

if (mode === 'echo') {
  for (const word of rest) {
    if (word.startsWith('err:')) {
      process.stderr.write(`${word.slice(4)}\n`);
    } else {
      process.stdout.write(`${word}\n`);
    }
  }
} else if (mode === 'exit') {
  process.exitCode = Number(rest[0]);
} else if (mode === 'env') {
  process.stdout.write(`${process.env[rest[0] ?? ''] ?? ''}\n`);
} else if (mode === 'serve') {
  const server = Bun.serve({
    port: Number(process.env['PORT']),
    hostname: '127.0.0.1',
    routes: {
      '/health': new Response('ok'),
      '/*': new Response('missing', { status: 404 }),
    },
  });

  process.on('SIGTERM', async () => {
    await server.stop(true);

    process.exit(0);
  });

  process.stdout.write(`listening on ${server.port}\n`);
} else if (mode === 'mute') {
  process.on('SIGTERM', () => {
    process.exit(0);
  });

  setInterval(() => null, 1000);
} else {
  process.stderr.write(`unknown mode ${mode ?? ''}\n`);

  process.exitCode = 64;
}
