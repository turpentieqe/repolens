import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { analyzeProject, findCycles } from '../src/server/analyzer.js';
import type { ModuleEdge, ModuleNode, ProjectGraph } from '../src/shared/graph.js';

async function withFixture(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'repolens-analyzer-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function moduleNode(graph: ProjectGraph, id: string): ModuleNode {
  const node = graph.nodes.find((node) => node.id === id);
  assert.ok(node, `Missing module ${id}`);
  return node;
}

function edge(source: string, target: string, typeOnly = false): ModuleEdge {
  return { source, target, typeOnly };
}

function sortedEdges(edges: ModuleEdge[]): ModuleEdge[] {
  return [...edges].sort(
    (a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  );
}

function assertEdges(graph: ProjectGraph, expected: ModuleEdge[]): void {
  assert.deepEqual(sortedEdges(graph.edges), sortedEdges(expected));
}

function assertGraphIntegrity(graph: ProjectGraph): void {
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.equal(ids.size, graph.nodes.length, 'Module IDs must be unique');
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.source), `Unknown source ${edge.source}`);
    assert.ok(ids.has(edge.target), `Unknown target ${edge.target}`);
    const pair = JSON.stringify([edge.source, edge.target]);
    assert.ok(!pairs.has(pair), `Duplicate edge ${pair}`);
    pairs.add(pair);
    assert.equal(typeof edge.typeOnly, 'boolean');
  }
  for (const node of graph.nodes) {
    assert.ok(!node.id.includes('\\'), 'IDs must use forward slashes');
    assert.equal(node.imports, graph.edges.filter((edge) => edge.source === node.id).length);
    assert.equal(node.importedBy, graph.edges.filter((edge) => edge.target === node.id).length);
    const cycleId = graph.cycles.findIndex((group) => group.includes(node.id));
    assert.equal(node.cycleId, cycleId < 0 ? null : cycleId, `cycleId for ${node.id}`);
  }
  assert.ok(Number.isFinite(Date.parse(graph.project.analyzedAt)));
  assert.ok(Number.isInteger(graph.project.durationMs) && graph.project.durationMs >= 0);
}

async function analyzeFixture(
  files: Record<string, string>,
  check: (graph: ProjectGraph, root: string) => void | Promise<void>,
): Promise<void> {
  await withFixture(files, async (root) => {
    const graph = await analyzeProject(root);
    assertGraphIntegrity(graph);
    assert.deepEqual(graph.warnings, []);
    await check(graph, root);
  });
}

describe('analyzeProject: dependency syntax', () => {
  test('resolves relative imports, export-from declarations, side effects, and directory indexes', async () => {
    await analyzeFixture(
      {
        'src/main.ts': [
          "import { value } from './value';",
          "import View from './View';",
          "import './setup';",
          "export { value as renamed } from './value';",
          "export * from './barrel';",
          "export * as helpers from './helpers';",
        ].join('\n'),
        'src/value.ts': 'export const value = 1;',
        'src/View.tsx': 'export default function View() { return <div />; }',
        'src/setup.js': 'globalThis.ready = true;',
        'src/barrel/index.ts': 'export const item = 1;',
        'src/helpers.ts': 'export const helper = 1;',
      },
      (graph) => {
        assert.equal(graph.nodes.length, 6);
        assertEdges(graph, [
          edge('src/main.ts', 'src/value.ts'),
          edge('src/main.ts', 'src/View.tsx'),
          edge('src/main.ts', 'src/setup.js'),
          edge('src/main.ts', 'src/barrel/index.ts'),
          edge('src/main.ts', 'src/helpers.ts'),
        ]);
        assert.deepEqual(moduleNode(graph, 'src/main.ts').exports, ['*', 'helpers', 'renamed']);
        assert.deepEqual(
          graph.nodes.flatMap((node) => node.unresolved),
          [],
        );
        assert.deepEqual(graph.cycles, []);
      },
    );
  });

  const typeCases: Array<[string, string, boolean]> = [
    ['type-only named import', "import type { Shape } from './dependency';", true],
    ['type-only default import', "import type DefaultShape from './dependency';", true],
    ['type-only namespace import', "import type * as Shapes from './dependency';", true],
    [
      'inline type-only named imports',
      "import { type Shape, type Other } from './dependency';",
      true,
    ],
    ['mixed named imports', "import { type Shape, value } from './dependency';", false],
    [
      'default value with type-only named imports',
      "import DefaultShape, { type Shape } from './dependency';",
      false,
    ],
    ['default value import', "import DefaultShape from './dependency';", false],
    ['namespace value import', "import * as Shapes from './dependency';", false],
    ['side-effect import', "import './dependency';", false],
    ['empty named import', "import {} from './dependency';", false],
    ['type-only export-from', "export type { Shape as PublicShape } from './dependency';", true],
    [
      'inline type-only export-from',
      "export { type Shape, type Other } from './dependency';",
      true,
    ],
    ['mixed export-from', "export { type Shape, value } from './dependency';", false],
    ['type-only star export', "export type * from './dependency';", true],
    ['type-only namespace export', "export type * as Shapes from './dependency';", true],
    ['value star export', "export * from './dependency';", false],
    ['import-equals require', "import Shapes = require('./dependency');", false],
    ['type-only import-equals require', "import type Shapes = require('./dependency');", true],
    ['import type expression', "type Shape = import('./dependency').Shape;", true],
    ['typeof import expression', "type Shapes = typeof import('./dependency');", true],
  ];
  for (const [name, source, typeOnly] of typeCases) {
    test(name, async () => {
      await analyzeFixture(
        {
          'main.ts': source,
          'dependency.ts': [
            'export interface Shape { id: string }',
            'export type Other = number;',
            'export const value = 1;',
            'export default class DefaultShape {}',
          ].join('\n'),
        },
        (graph) => {
          assertEdges(graph, [edge('main.ts', 'dependency.ts', typeOnly)]);
          assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
          assert.deepEqual(moduleNode(graph, 'main.ts').external, []);
        },
      );
    });
  }

  test('finds literal require and dynamic import calls, including nested calls and static templates', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          "const common = require('./common.cjs');",
          'const template = require(`./template-require`);',
          "export async function load() { return import('./lazy'); }",
          'const lazyTemplate = () => import(`./template-import`);',
        ].join('\n'),
        'common.cjs': 'module.exports = 1;',
        'template-require.ts': 'export const value = 1;',
        'lazy.ts': 'export default 1;',
        'template-import.ts': 'export default 2;',
      },
      (graph) => {
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
        assertEdges(graph, [
          edge('main.ts', 'common.cjs'),
          edge('main.ts', 'template-require.ts'),
          edge('main.ts', 'lazy.ts'),
          edge('main.ts', 'template-import.ts'),
        ]);
      },
    );
  });

  test('does not invent dependencies from computed calls, ordinary calls, comments, or strings', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          "const target = './dependency';",
          'require(target);',
          'import(target);',
          "require('./' + 'dependency');",
          'import(`./${target}`);',
          "object.require('./dependency');",
          "ordinary('./dependency');",
          "// import './missing-comment';",
          'const text = "require(\'./missing-string\')";',
        ].join('\n'),
        'dependency.ts': 'export const value = 1;',
      },
      (graph) => {
        assertEdges(graph, []);
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
        assert.deepEqual(moduleNode(graph, 'main.ts').external, []);
      },
    );
  });

  for (const runtimeFirst of [false, true]) {
    test(`deduplicates specifiers and resolved targets; runtime wins when ${runtimeFirst ? 'first' : 'last'}`, async () => {
      const runtime = ["import { value } from './dependency';", "require('./dependency.js');"];
      const types = [
        "import type { Shape } from './dependency';",
        "export type { Shape } from './dependency.js';",
      ];
      await analyzeFixture(
        {
          'main.ts': [
            ...(runtimeFirst ? [...runtime, ...types] : [...types, ...runtime]),
            "import type { Shape as ShapeAgain } from './dependency';",
          ].join('\n'),
          'dependency.ts': 'export interface Shape {}\nexport const value = 1;',
        },
        (graph) => {
          assertEdges(graph, [edge('main.ts', 'dependency.ts')]);
          assert.equal(moduleNode(graph, 'main.ts').imports, 1);
          assert.equal(moduleNode(graph, 'dependency.ts').importedBy, 1);
        },
      );
    });
  }

  test('keeps a deduplicated edge type-only when every reference is type-only', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          "import type { Shape } from './dependency';",
          "export type { Shape } from './dependency';",
          "type Again = import('./dependency.js').Shape;",
        ].join('\n'),
        'dependency.ts': 'export interface Shape {}',
      },
      (graph) => assertEdges(graph, [edge('main.ts', 'dependency.ts', true)]),
    );
  });
});

describe('analyzeProject: resolution and file selection', () => {
  test('inherits root tsconfig aliases, including exact and wildcard-suffix mappings', async () => {
    await analyzeFixture(
      {
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['./src/*'],
              '@model': ['./src/model.ts'],
              'internal/*/entry': ['./src/*/index.ts'],
            },
          },
        }),
        'src/nested/main.ts': [
          "import { value } from '@/utility';",
          "import type { Model } from '@model';",
          "export * from 'internal/feature/entry';",
        ].join('\n'),
        'src/utility.ts': 'export const value = 1;',
        'src/model.ts': 'export interface Model {}',
        'src/feature/index.ts': 'export const feature = 1;',
      },
      (graph) => {
        assertEdges(graph, [
          edge('src/nested/main.ts', 'src/utility.ts'),
          edge('src/nested/main.ts', 'src/model.ts', true),
          edge('src/nested/main.ts', 'src/feature/index.ts'),
        ]);
        assert.deepEqual(
          graph.nodes.flatMap((node) => node.unresolved),
          [],
        );
        assert.deepEqual(
          graph.nodes.flatMap((node) => node.external),
          [],
        );
      },
    );
  });

  test('uses the nearest tsconfig rather than a cached root configuration', async () => {
    await analyzeFixture(
      {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '@value': ['./root-value.ts'] } },
        }),
        'main.ts': "import '@value';",
        'root-value.ts': 'export const value = 1;',
        'nested/tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '@value': ['./local-value.ts'] } },
        }),
        'nested/main.ts': "import '@value';",
        'nested/local-value.ts': 'export const value = 2;',
      },
      (graph) =>
        assertEdges(graph, [
          edge('main.ts', 'root-value.ts'),
          edge('nested/main.ts', 'nested/local-value.ts'),
        ]),
    );
  });

  test('supports jsconfig path aliases for JavaScript projects', async () => {
    await analyzeFixture(
      {
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/main.js': "import '@/value';",
        'src/value.js': 'export const value = 1;',
      },
      (graph) => assertEdges(graph, [edge('src/main.js', 'src/value.js')]),
    );
  });

  test('resolves .js to .ts, .mjs to .mts, and .cjs to .cts', async () => {
    await analyzeFixture(
      {
        'main.ts': "import './regular.js';\nimport './module.mjs';\nimport './common.cjs';",
        'regular.ts': 'export const value = 1;',
        'module.mts': 'export const value = 2;',
        'common.cts': 'export const value = 3;',
      },
      (graph) => {
        assertEdges(graph, [
          edge('main.ts', 'regular.ts'),
          edge('main.ts', 'module.mts'),
          edge('main.ts', 'common.cts'),
        ]);
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
      },
    );
  });

  test('includes JS/TS variants and declarations but not non-code files', async () => {
    const names = [
      'plain.ts',
      'view.tsx',
      'plain.js',
      'view.jsx',
      'module.mts',
      'module.mjs',
      'common.cts',
      'common.cjs',
      'types.d.ts',
    ];
    await analyzeFixture(
      {
        ...Object.fromEntries(names.map((name) => [name, ''])),
        'data.json': '{}',
        'style.css': 'body {}',
        'notes.txt': 'not code',
      },
      (graph) => {
        assert.deepEqual(graph.nodes.map((node) => node.id).sort(), [...names].sort());
        assertEdges(graph, []);
      },
    );
  });

  test('honors root gitignore directory patterns, negation, and root anchoring', async () => {
    await analyzeFixture(
      {
        '.gitignore': 'ignored/\n*.generated.ts\n!keep.generated.ts\n/root-only.ts\n',
        'main.ts':
          "import './ignored/hidden';\nimport './drop.generated';\nimport './keep.generated';",
        'ignored/hidden.ts': "import './missing';",
        'drop.generated.ts': '',
        'keep.generated.ts': '',
        'root-only.ts': '',
        'nested/root-only.ts': '',
        'nested/drop.generated.ts': '',
      },
      (graph) => {
        assert.deepEqual(graph.nodes.map((node) => node.id).sort(), [
          'keep.generated.ts',
          'main.ts',
          'nested/root-only.ts',
        ]);
        assertEdges(graph, [edge('main.ts', 'keep.generated.ts')]);
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
      },
    );
  });

  test('skips node_modules and generated directories at every depth', async () => {
    await analyzeFixture(
      {
        'main.ts':
          "import './dist/bundle';\nimport './src/dist/bundle';\nimport 'installed-package';",
        'src/kept.ts': '',
        'node_modules/installed-package/package.json': JSON.stringify({
          name: 'installed-package',
          main: 'index.js',
        }),
        'node_modules/installed-package/index.js': 'module.exports = 1;',
        'dist/bundle.ts': '',
        'src/dist/bundle.ts': '',
        'src/node_modules/nested-package/index.ts': '',
        'build/output.ts': '',
        'coverage/output.js': '',
        '.git/hook.js': '',
        '.next/output.js': '',
      },
      (graph) => {
        assert.deepEqual(
          graph.nodes.map((node) => node.id),
          ['main.ts', 'src/kept.ts'],
        );
        assertEdges(graph, []);
        assert.deepEqual(moduleNode(graph, 'main.ts').external, ['installed-package']);
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
      },
    );
  });

  test('separates unresolved relative/alias imports from deduplicated external packages', async () => {
    await analyzeFixture(
      {
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['./src/*'],
              '@exact': ['./absent.ts'],
              'internal/*/entry': ['./src/*/index.ts'],
            },
          },
        }),
        'main.ts': [
          "import './missing';",
          "export * from './missing';",
          "import '../missing-parent';",
          "import '@/missing';",
          "import '@exact';",
          "import 'internal/missing/entry';",
          "import 'react';",
          "import 'react/jsx-runtime';",
          "import '@scope/package';",
          "import '@scope/package/subpath';",
          "import 'node:fs/promises';",
          "import 'fs/promises';",
          "import 'internal/missing/not-entry';",
        ].join('\n'),
      },
      (graph) => {
        assertEdges(graph, []);
        assert.deepEqual(
          moduleNode(graph, 'main.ts').unresolved,
          [
            '../missing-parent',
            './missing',
            '@/missing',
            '@exact',
            'internal/missing/entry',
          ].sort(),
        );
        assert.deepEqual(moduleNode(graph, 'main.ts').external, [
          '@scope/package',
          'fs',
          'internal',
          'node:fs/promises',
          'react',
        ]);
      },
    );
  });

  test('ignores asset imports, including missing assets and query suffixes', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          "import './style.css';",
          "import './theme.scss';",
          "import logo from './logo.svg?raw';",
          "import data from './data.json';",
          "require('./image.png');",
          "import('./font.woff2');",
        ].join('\n'),
        'data.json': '{}',
      },
      (graph) => {
        assert.deepEqual(
          graph.nodes.map((node) => node.id),
          ['main.ts'],
        );
        assertEdges(graph, []);
        assert.deepEqual(moduleNode(graph, 'main.ts').unresolved, []);
        assert.deepEqual(moduleNode(graph, 'main.ts').external, []);
      },
    );
  });
});

describe('analyzeProject: nodes, exports, and cycles', () => {
  test('preserves an isolated empty file with zero counts and no cycle', async () => {
    await analyzeFixture({ 'nested/empty.ts': '' }, (graph, root) => {
      assert.deepEqual(graph.nodes, [
        {
          id: 'nested/empty.ts',
          name: 'empty.ts',
          directory: 'nested',
          extension: 'ts',
          lines: 0,
          size: 0,
          exports: [],
          external: [],
          unresolved: [],
          importedBy: 0,
          imports: 0,
          cycleId: null,
        },
      ]);
      assertEdges(graph, []);
      assert.deepEqual(graph.cycles, []);
      assert.equal(graph.project.name, path.basename(root));
      assert.equal(graph.project.demo, false);
    });
  });

  test('handles an empty project', async () => {
    await analyzeFixture({}, (graph) => {
      assert.deepEqual(graph.nodes, []);
      assertEdges(graph, []);
      assert.deepEqual(graph.cycles, []);
    });
  });

  test('uses the package name and counts UTF-8 bytes and lines correctly', async () => {
    const crlf = '// café\r\nexport const value = 1;\r\n';
    await analyzeFixture(
      {
        'package.json': JSON.stringify({ name: '@example/fixture' }),
        'crlf.ts': crlf,
        'no-newline.ts': 'export const value = 1;',
        'blank.ts': '\n',
      },
      (graph) => {
        assert.equal(graph.project.name, '@example/fixture');
        assert.equal(moduleNode(graph, 'crlf.ts').lines, 2);
        assert.equal(moduleNode(graph, 'crlf.ts').size, Buffer.byteLength(crlf));
        assert.equal(moduleNode(graph, 'no-newline.ts').lines, 1);
        assert.equal(moduleNode(graph, 'blank.ts').lines, 1);
      },
    );
  });

  test('collects exported declarations, aliases, namespace re-exports, and destructured binding names', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          'const privateValue = 1;',
          'export const simple = 1, second = 2;',
          'export let mutable = 0;',
          'export function work() {}',
          'export class Widget {}',
          'export interface Shape {}',
          'export type Alias = number;',
          'export enum Choice { First }',
          'export namespace EmptyNamespace {}',
          'export const { property: renamedBinding, nested: { leaf }, ...rest } = { property: 1, nested: { leaf: 2 } };',
          'export const [first, , { item: deep }, ...remaining] = [1, 2, { item: 3 }];',
          'export { privateValue as publicValue, privateValue as "kebab-name" };',
          "export { item as renamedExport } from './dependency';",
          "export * as utilities from './dependency';",
          "export * from './dependency';",
          'export default function internalDefaultName() {}',
        ].join('\n'),
        'dependency.ts': 'export const item = 1;',
      },
      (graph) => {
        assert.deepEqual(
          moduleNode(graph, 'main.ts').exports,
          [
            '*',
            'Alias',
            'Choice',
            'EmptyNamespace',
            'Shape',
            'Widget',
            'deep',
            'default',
            'first',
            'kebab-name',
            'leaf',
            'mutable',
            'publicValue',
            'remaining',
            'renamedBinding',
            'renamedExport',
            'rest',
            'second',
            'simple',
            'utilities',
            'work',
          ].sort(),
        );
        assertEdges(graph, [edge('main.ts', 'dependency.ts')]);
      },
    );
  });

  test('does not expose namespace members as module-level exports', async () => {
    await analyzeFixture(
      {
        'main.ts': [
          'export namespace PublicAPI {',
          '  export const nestedValue = 1;',
          '  export interface NestedShape {}',
          '}',
          'namespace PrivateAPI { export const hiddenValue = 2; }',
          'export const topLevel = 3;',
        ].join('\n'),
      },
      (graph) => {
        assert.deepEqual(moduleNode(graph, 'main.ts').exports, ['PublicAPI', 'topLevel']);
      },
    );
  });

  for (const source of [
    'export default class NamedClass {}',
    'export default class {}',
    'export default function () {}',
    'const privateValue = 1; export default privateValue;',
  ]) {
    test(`records only the public default name: ${source}`, async () => {
      await analyzeFixture({ 'main.ts': source }, (graph) => {
        assert.deepEqual(moduleNode(graph, 'main.ts').exports, ['default']);
      });
    });
  }

  test('assigns stable cycle IDs to self-imports and separate SCCs without including an acyclic diamond', async () => {
    await analyzeFixture(
      {
        'a.ts': "import './b';",
        'b.ts': "import './a';\nimport './c';",
        'c.ts': "import type { D } from './d';\nexport interface C {}",
        'd.ts': "import type { C } from './c';\nexport interface D {}",
        'self.ts': "import './self';",
        'root.ts': "import './left';\nimport './right';",
        'left.ts': "import './leaf';",
        'right.ts': "import './leaf';",
        'leaf.ts': '',
        'isolated.ts': '',
      },
      (graph) => {
        assert.deepEqual(graph.cycles, [['a.ts', 'b.ts'], ['c.ts', 'd.ts'], ['self.ts']]);
        assert.equal(moduleNode(graph, 'a.ts').cycleId, 0);
        assert.equal(moduleNode(graph, 'd.ts').cycleId, 1);
        assert.equal(moduleNode(graph, 'self.ts').cycleId, 2);
        for (const id of ['root.ts', 'left.ts', 'right.ts', 'leaf.ts', 'isolated.ts']) {
          assert.equal(moduleNode(graph, id).cycleId, null);
        }
        assert.equal(moduleNode(graph, 'self.ts').imports, 1);
        assert.equal(moduleNode(graph, 'self.ts').importedBy, 1);
        assert.equal(moduleNode(graph, 'leaf.ts').importedBy, 2);
        assertEdges(graph, [
          edge('a.ts', 'b.ts'),
          edge('b.ts', 'a.ts'),
          edge('b.ts', 'c.ts'),
          edge('c.ts', 'd.ts', true),
          edge('d.ts', 'c.ts', true),
          edge('self.ts', 'self.ts'),
          edge('root.ts', 'left.ts'),
          edge('root.ts', 'right.ts'),
          edge('left.ts', 'leaf.ts'),
          edge('right.ts', 'leaf.ts'),
        ]);
      },
    );
  });

  test('rejects nonexistent paths and regular files', async () => {
    await withFixture({ 'file.ts': '' }, async (root) => {
      await assert.rejects(analyzeProject(path.join(root, 'absent')), { code: 'ENOENT' });
      await assert.rejects(
        analyzeProject(path.join(root, 'file.ts')),
        /Project path must be a directory/,
      );
    });
  });

  test('warns for a malformed manifest without losing graph data', async () => {
    await withFixture({ 'package.json': '{', 'main.ts': '' }, async (root) => {
      const graph = await analyzeProject(root);
      assertGraphIntegrity(graph);
      assert.equal(graph.project.name, path.basename(root));
      assert.deepEqual(graph.warnings, ['Could not read project name from package.json.']);
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ['main.ts'],
      );
    });
  });
});

describe('findCycles', () => {
  test('handles empty graphs, isolated modules, and singleton self-loops', () => {
    assert.deepEqual(findCycles([], []), []);
    assert.deepEqual(findCycles(['alone'], []), []);
    assert.deepEqual(findCycles(['alone'], [edge('alone', 'alone', true)]), [['alone']]);
  });

  test('does not mistake a diamond or cross-edges for a cycle in any starting order', () => {
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('b', 'c')];
    for (const ids of [
      ['a', 'b', 'c', 'd'],
      ['d', 'c', 'b', 'a'],
      ['b', 'd', 'a', 'c'],
    ]) {
      assert.deepEqual(findCycles(ids, edges), []);
      assert.deepEqual(findCycles(ids, [...edges].reverse()), []);
    }
  });

  test('returns maximal sorted SCCs, excludes connecting tails, and leaves inputs unchanged', () => {
    const ids = ['tail', 'f', 'e', 'd', 'c', 'b', 'a', 'self', 'isolated'];
    const edges = [
      edge('a', 'b'),
      edge('b', 'a'),
      edge('b', 'c'),
      edge('c', 'b'),
      edge('c', 'd'),
      edge('d', 'e', true),
      edge('e', 'f'),
      edge('f', 'd'),
      edge('f', 'tail'),
      edge('self', 'self'),
      edge('a', 'b'),
    ];
    const originalIds = [...ids];
    const originalEdges = edges.map((edge) => ({ ...edge }));
    assert.deepEqual(findCycles(ids, edges), [['a', 'b', 'c'], ['d', 'e', 'f'], ['self']]);
    assert.deepEqual(findCycles([...ids].reverse(), [...edges].reverse()), [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['self'],
    ]);
    assert.deepEqual(ids, originalIds);
    assert.deepEqual(edges, originalEdges);
  });

  test('matches an independent reachability oracle for all 512 directed three-node graphs', () => {
    const ids = ['a', 'b', 'c'];
    const possible = ids.flatMap((source) => ids.map((target) => edge(source, target)));
    for (let mask = 0; mask < 2 ** possible.length; mask++) {
      const edges = possible.filter((_, index) => (mask & (1 << index)) !== 0);
      const reachable = ids.map((source) =>
        ids.map((target) => edges.some((edge) => edge.source === source && edge.target === target)),
      );
      // Transitive closure is independent of the analyzer's DFS/SCC algorithm.
      for (let via = 0; via < ids.length; via++) {
        for (let from = 0; from < ids.length; from++) {
          for (let to = 0; to < ids.length; to++) {
            reachable[from][to] ||= reachable[from][via] && reachable[via][to];
          }
        }
      }
      const assigned = new Set<string>();
      const expected: string[][] = [];
      for (let i = 0; i < ids.length; i++) {
        if (assigned.has(ids[i]) || !reachable[i][i]) continue;
        const group = ids.filter((_, j) => reachable[i][j] && reachable[j][i]);
        group.forEach((id) => assigned.add(id));
        expected.push(group);
      }
      assert.deepEqual(findCycles(ids, edges), expected, `Graph bitmask ${mask}`);
      assert.deepEqual(
        findCycles([...ids].reverse(), [...edges].reverse()),
        expected,
        `Reversed graph ${mask}`,
      );
    }
  });

  test('handles deep graphs without overflowing the JavaScript call stack', () => {
    const ids = Array.from(
      { length: 12_000 },
      (_, index) => `module-${String(index).padStart(5, '0')}`,
    );
    const edges = ids.slice(1).map((id, index) => edge(ids[index], id));
    assert.deepEqual(findCycles(ids, edges), []);
    assert.deepEqual(findCycles(ids, [...edges, edge(ids[ids.length - 1], ids[0])]), [ids]);
  });
});

test('demo integration: 25 modules, 40 edges, two known cycles, and no unresolved imports', async () => {
  const root = fileURLToPath(new URL('../demo/', import.meta.url));
  const graph = await analyzeProject(root, true);
  assertGraphIntegrity(graph);
  assert.equal(graph.project.name, 'orbit-dashboard');
  assert.equal(graph.project.demo, true);
  assert.equal(graph.nodes.length, 25);
  assert.equal(graph.edges.length, 40);
  assert.equal(graph.cycles.length, 2);
  assert.deepEqual(graph.cycles, [
    ['src/lib/filterTokens.ts', 'src/lib/filters.ts'],
    ['src/lib/sessionEvents.ts', 'src/lib/sessionStore.ts'],
  ]);
  assert.deepEqual(
    graph.nodes.flatMap((node) => node.unresolved),
    [],
  );
  assert.deepEqual(graph.warnings, []);
  const isolated = moduleNode(graph, 'src/lib/constellations.ts');
  assert.equal(isolated.imports, 0);
  assert.equal(isolated.importedBy, 0);
  assert.equal(isolated.cycleId, null);
});
