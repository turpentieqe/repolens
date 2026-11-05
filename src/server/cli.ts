#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeProject } from './analyzer.js';
import { startServer } from './server.js';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      demo: { type: 'boolean', default: false },
      dev: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      port: { type: 'string', default: '4173' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`RepoLens — see how your code connects.

Usage: repolens [directory] [options]

  --demo         Explore the included demo project
  --port <port>  Local server port (default: 4173)
  --json         Print the dependency graph as JSON and exit
  -h, --help     Show this help

Analyzes JS, JSX, TS, TSX, MJS, CJS, MTS and CTS files.
Resolves relative imports and tsconfig/jsconfig path aliases.
Includes literal require(), dynamic imports and type-only imports.
Honors the root .gitignore; skips dependencies, build output and symlinks.
Cycle groups include type-only edges, not just runtime imports.
Source code never leaves your machine. No project code is executed.`);
  } else {
    if (positionals.length > 1) throw new Error('Provide only one project directory.');
    if (values.demo && positionals.length)
      throw new Error('Use either a project directory or --demo, not both.');
    const port = Number(values.port);
    if (!/^\d+$/.test(values.port!) || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Port must be an integer between 1 and 65535.');
    const root = values.demo
      ? fileURLToPath(new URL('../../demo/', import.meta.url))
      : path.resolve(positionals[0] ?? process.cwd());
    if (values.json) console.log(JSON.stringify(await analyzeProject(root, values.demo), null, 2));
    else {
      const { server, graph } = await startServer({
        root,
        demo: values.demo,
        dev: values.dev,
        port,
      });
      console.log(
        `\n  RepoLens / ${graph.project.name}\n  ${graph.nodes.length} modules · ${graph.edges.length} connections · ${graph.cycles.length} cycle groups\n\n  Open http://127.0.0.1:${port}\n  Local only. Press Ctrl+C to stop.\n`,
      );
      const shutdown = () => {
        server.close();
        server.closeAllConnections();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    }
  }
} catch (error) {
  console.error(`RepoLens: ${(error as Error).message}`);
  process.exitCode = 1;
}
