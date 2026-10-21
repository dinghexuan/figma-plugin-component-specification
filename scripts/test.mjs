import { build } from 'esbuild';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'theme-configurator-tests-'));
const output = join(directory, 'plugin.test.mjs');
try {
  await build({ entryPoints: ['tests/plugin.test.mjs'], bundle: true, platform: 'node', format: 'esm', outfile: output });
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), output], { stdio: 'inherit', env: process.env });
  process.exitCode = result.status ?? 1;
} finally {
  await unlink(output);
  await rmdir(directory);
}
