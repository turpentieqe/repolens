import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/server/cli.ts', import.meta.url));
const run = (...args: string[]) => exec(process.execPath, ['--import', 'tsx', cli, ...args]);

test('CLI prints help without starting a server', async () => {
  const { stdout, stderr } = await run('--help');
  assert.match(stdout, /Usage: repolens/);
  assert.match(stdout, /--json/);
  assert.equal(stderr, '');
});

test('CLI produces pure JSON and never executes analyzed code', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'repolens-cli-'));
  const sentinel = path.join(root, 'executed.txt');
  try {
    await writeFile(
      path.join(root, 'entry.js'),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'executed');`,
    );
    const { stdout, stderr } = await run(root, '--json');
    const graph = JSON.parse(stdout);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'entry.js');
    assert.equal(stderr, '');
    await assert.rejects(access(sentinel), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI rejects ambiguous paths, unknown options and invalid ports', async () => {
  for (const args of [
    ['--port', '0'],
    ['--port', '65536'],
    ['--port', 'abc'],
    ['--demo', '.'],
    ['one', 'two'],
    ['--unknown'],
  ]) {
    await assert.rejects(run(...args), (error: unknown) => {
      const failure = error as Error & { code: number; stderr: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stderr, /RepoLens:/);
      return true;
    });
  }
});
