// A small interactive program for the spawnCLI tests; its first argument picks a mode.
const [mode, argument] = process.argv.slice(2);

function printSize(): void {
  process.stdout.write(`size ${process.stdout.columns}x${process.stdout.rows}\n`);
}

if (mode === 'prompt') {
  process.stdout.write('What is your name? ');

  process.stdin.once('data', (chunk) => {
    process.stdout.write(`Hello, ${String(chunk).trim()}!\n`);
    process.exit(0);
  });
} else if (mode === 'redraw') {
  for (const percent of [10, 50, 90]) {
    process.stdout.write(`loading ${percent}%\r`);
  }

  process.stdout.write('\u001B[2Kdone\n');
} else if (mode === 'link') {
  process.stdout.write('\u001B]8;;https://example.com/docs\u0007the docs\u001B]8;;\u0007\n');
} else if (mode === 'exit') {
  process.exitCode = Number(argument);
} else if (mode === 'size') {
  process.stdout.on('resize', printSize);

  printSize();

  setInterval(() => {
    // keeps the process alive
  }, 1000);
} else if (mode === 'keys') {
  process.stdin.setRawMode(true);
  process.stdout.write('ready\n');

  process.stdin.on('data', (chunk) => {
    const text = String(chunk);

    if (text === '\u0003') {
      process.stdout.write('cancelled\n');
      process.exit(130);
    }

    process.stdout.write(`key ${Buffer.from(text).toString('hex')}\n`);
  });
} else if (mode === 'wait') {
  process.stdout.write('waiting\n');

  setInterval(() => {
    // keeps the process alive
  }, 1000);
} else {
  process.stderr.write(`unknown mode ${mode ?? ''}\n`);

  process.exitCode = 64;
}
