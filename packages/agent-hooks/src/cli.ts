#!/usr/bin/env bun
import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';
import { bunFileSystem } from './init/bun-file-system.ts';
import { runInit } from './init/run-init.ts';
import { readProjectDir } from './read-project-dir.ts';

const init = define({
  name: 'init',
  description:
    'Write the agent hook entries into .claude/settings.json and .codex/hooks.json, with a PreToolUse matcher that names each gated tool',
  run: async () => {
    const projectDir = await readProjectDir(process.cwd());
    const result = await runInit({ projectDir, fileSystem: bunFileSystem });

    if (!result.ok) {
      console.error(`agent-hooks init: ${result.error}`);
      process.exit(1);
    }

    console.log(`agent-hooks init wrote ${result.written.join(' and ')}`);
  },
});

const usage = define({
  name: 'agent-hooks',
  run: () => {
    console.error('Usage: agent-hooks init');
    process.exit(1);
  },
});

try {
  await cli(process.argv.slice(2), usage, { name: 'agent-hooks', subCommands: { init } });
} catch (error) {
  console.error(`agent-hooks: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Usage: agent-hooks init');
  process.exit(1);
}
