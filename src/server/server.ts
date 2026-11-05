import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject } from './analyzer.js';

interface ServerOptions {
  root: string;
  demo: boolean;
  dev: boolean;
  port: number;
}

export async function startServer(options: ServerOptions) {
  let graph = await analyzeProject(options.root, options.demo);
  let pending: ReturnType<typeof analyzeProject> | undefined;
  const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
  const vite = options.dev
    ? await (
        await import('vite')
      ).createServer({
        configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      })
    : undefined;
  const send = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : options.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!hosts.has(request.headers.host ?? '')) {
      send(response, 403, { error: 'Local requests only.' });
      return;
    }
    const origin = request.headers.origin;
    if (origin && ![...hosts].some((host) => origin === `http://${host}`)) {
      send(response, 403, { error: 'Cross-origin requests are not allowed.' });
      return;
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      send(response, 403, { error: 'Cross-site requests are not allowed.' });
      return;
    }
    if (!options.dev)
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname === '/api/graph' && request.method === 'GET') {
        send(response, 200, graph);
        return;
      }
      if (url.pathname === '/api/refresh' && request.method === 'POST') {
        pending ??= analyzeProject(options.root, options.demo).finally(() => {
          pending = undefined;
        });
        graph = await pending;
        send(response, 200, graph);
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        send(response, 404, { error: 'Endpoint not found.' });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, 405, { error: 'Method not allowed.' });
        return;
      }
      if (vite) {
        vite.middlewares(request, response, () => send(response, 404, { error: 'Not found.' }));
        return;
      }
      const relative =
        url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(webRoot, relative);
      if (
        !file.startsWith(webRoot) ||
        relative.includes('\0') ||
        (relative !== 'index.html' && relative !== 'favicon.svg' && !relative.startsWith('assets/'))
      ) {
        send(response, 404, { error: 'Not found.' });
        return;
      }
      const content = await readFile(file);
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      response.writeHead(200, {
        'Content-Type': `${types[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8`,
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR' || error instanceof URIError)
        send(response, 404, { error: 'Not found.' });
      else {
        console.error(error);
        send(response, 500, {
          error: 'Unable to scan this project. Check the terminal and try again.',
        });
      }
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await vite?.close();
    throw error;
  }
  server.once('close', () => {
    void vite?.close();
  });
  return { server, graph };
}
