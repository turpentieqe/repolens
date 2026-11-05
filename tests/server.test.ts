import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server/server.js';

let root: string;
let server: http.Server;
let origin: string;
let port: number;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'repolens-server-'));
  await writeFile(path.join(root, 'index.ts'), 'export const secretSourceMarker = 42;');
  ({ server } = await startServer({ root, port: 0, demo: false, dev: false }));
  port = (server.address() as import('node:net').AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  if (root) await rm(root, { recursive: true, force: true });
});

function request(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves graph metadata with local-only security headers', async () => {
  const response = await fetch(`${origin}/api/graph`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const graph = await response.json();
  assert.equal(graph.nodes[0].id, 'index.ts');
  assert.equal('content' in graph.nodes[0], false);
  assert.equal('root' in graph.project, false);
});

test('refresh rescans files and updates cached results', async () => {
  await writeFile(path.join(root, 'added.ts'), "import './index';");
  const response = await fetch(`${origin}/api/refresh`, {
    method: 'POST',
    headers: { Origin: origin },
  });
  assert.equal(response.status, 200);
  const graph = await response.json();
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges, [{ source: 'added.ts', target: 'index.ts', typeOnly: false }]);
  assert.equal((await (await fetch(`${origin}/api/graph`)).json()).nodes.length, 2);
});

test('rejects DNS rebinding hosts and external origins', async () => {
  assert.equal((await request('/api/graph', { Host: `attacker.invalid:${port}` })).status, 403);
  assert.equal(
    (await fetch(`${origin}/api/graph`, { headers: { Origin: 'https://attacker.invalid' } }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(`${origin}/api/refresh`, { method: 'POST', headers: { Origin: 'null' } })).status,
    403,
  );
  assert.equal((await request('/api/graph', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request('/api/graph', { Host: `localhost:${port}` })).status, 200);
});

test('does not expose source files or allow traversal', async () => {
  for (const url of [
    '/index.ts',
    '/package.json',
    '/api/source',
    '/../server/analyzer.ts',
    '/assets/../../server/analyzer.ts',
    '/assets/%2e%2e/%2e%2e/server/analyzer.ts',
    '/assets/%5c..%5c..%5cserver%5canalyzer.ts',
    '/%E0%A4%A',
  ]) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.ok(!response.body.includes('secretSourceMarker'), url);
  }
});

test('rejects unexpected HTTP methods and missing endpoints', async () => {
  assert.equal((await fetch(`${origin}/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${origin}/api/refresh`)).status, 404);
  assert.equal((await fetch(`${origin}/api/nope`)).status, 404);
});
