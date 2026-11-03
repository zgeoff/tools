// A small program for the run and start tests; its first argument picks a mode.
const [mode, ...rest] = process.argv.slice(2);

function exitOnTerm(): void {
  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

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
} else if (mode === 'cwd') {
  process.stdout.write(`${process.cwd()}\n`);
} else if (mode === 'serve') {
  const server = Bun.serve({
    port: Number(process.env['PORT']),
    hostname: '127.0.0.1',
    routes: {
      '/health': new Response('ok'),
      '/*': new Response('missing', { status: 404 }),
    },
  });

  exitOnTerm();

  process.stdout.write(`listening on ${server.port}\n`);
} else if (mode === 'mute') {
  exitOnTerm();

  setInterval(() => {
    // keeps the process alive until SIGTERM
  }, 1000);
} else if (mode === 'stubborn') {
  // Ignores SIGTERM, so only SIGKILL stops it.
  process.on('SIGTERM', () => {
    // ignored on purpose
  });

  setInterval(() => {
    // keeps the process alive
  }, 1000);

  process.stdout.write('stubborn\n');
} else if (mode === 'fork') {
  // The child stays in the program's process group and outlives the program unless a signal
  // reaches the whole group.
  const child = Bun.spawn(['sleep', '1000'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });

  exitOnTerm();

  process.stdout.write(`child ${child.pid}\n`);
} else if (mode === 'reply') {
  let pending = '';

  process.stdin.on('data', (chunk) => {
    pending += String(chunk);

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const line of lines) {
      process.stdout.write(`got ${line}\n`);
    }
  });

  process.stdin.on('end', () => {
    process.stdout.write('done\n');
  });
} else {
  process.stderr.write(`unknown mode ${mode ?? ''}\n`);

  process.exitCode = 64;
}
