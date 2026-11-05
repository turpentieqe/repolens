import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import ignore from 'ignore';
import type { ModuleEdge, ModuleNode, ProjectGraph } from '../shared/graph.js';

const extensions = /\.(?:[cm]?[jt]sx?)$/i;
const skipped = new Set([
  'node_modules',
  '.git',
  '.qoder',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  'vendor',
]);
const assetImport =
  /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|json|woff2?|ttf|wasm)(?:\?.*)?$/i;
const slash = (value: string) => value.split(path.sep).join('/');

export function findCycles(ids: string[], edges: ModuleEdge[]): string[][] {
  const forward = new Map(ids.map((id) => [id, [] as string[]]));
  const reverse = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    forward.get(edge.source)!.push(edge.target);
    reverse.get(edge.target)!.push(edge.source);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    const stack: [string, boolean][] = [[id, false]];
    while (stack.length) {
      const [current, done] = stack.pop()!;
      if (done) {
        order.push(current);
        continue;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push([current, true]);
      for (const next of forward.get(current)!) {
        if (!visited.has(next)) stack.push([next, false]);
      }
    }
  }
  visited.clear();
  const groups: string[][] = [];
  for (const id of order.reverse()) {
    if (visited.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      group.push(current);
      for (const next of reverse.get(current)!) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    if (group.length > 1 || forward.get(id)!.includes(id)) groups.push(group.sort());
  }
  return groups.sort((a, b) => a[0].localeCompare(b[0]));
}

export async function analyzeProject(input: string, demo = false): Promise<ProjectGraph> {
  const started = performance.now();
  const root = await realpath(input);
  if (!(await stat(root)).isDirectory()) throw new Error('Project path must be a directory.');
  const warnings: string[] = [];
  const matcher = ignore();
  try {
    matcher.add(await readFile(path.join(root, '.gitignore'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const relative = slash(path.relative(root, absolute));
      if (matcher.ignores(relative + (entry.isDirectory() ? '/' : ''))) continue;
      if (entry.isDirectory() && !skipped.has(entry.name)) await walk(absolute);
      else if (entry.isFile() && extensions.test(entry.name)) files.push(absolute);
    }
  }
  await walk(root);
  files.sort();
  const canonical = (file: string) =>
    ts.sys.useCaseSensitiveFileNames ? path.normalize(file) : path.normalize(file).toLowerCase();
  const fileMap = new Map(files.map((file) => [canonical(file), slash(path.relative(root, file))]));
  const configs = new Map<string, ts.CompilerOptions>();
  function compilerOptions(directory: string): ts.CompilerOptions {
    const cached = configs.get(directory);
    if (cached) return cached;
    const base: ts.CompilerOptions = {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      resolveJsonModule: true,
    };
    const configPath = ['tsconfig.json', 'jsconfig.json']
      .map((name) => path.join(directory, name))
      .find(ts.sys.fileExists);
    let options: ts.CompilerOptions;
    if (configPath) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error) {
        warnings.push(
          `${slash(path.relative(root, configPath))}: ${ts.flattenDiagnosticMessageText(config.error.messageText, ' ')}`,
        );
        options = base;
      } else {
        const parsed = ts.parseJsonConfigFileContent(
          config.config,
          ts.sys,
          directory,
          undefined,
          configPath,
        );
        options = { ...base, ...parsed.options };
        for (const error of parsed.errors.filter((error) => error.code !== 18003)) {
          warnings.push(ts.flattenDiagnosticMessageText(error.messageText, ' '));
        }
      }
    } else options = directory === root ? base : compilerOptions(path.dirname(directory));
    configs.set(directory, options);
    return options;
  }
  const nodes: ModuleNode[] = [];
  const edges: ModuleEdge[] = [];
  for (const file of files) {
    const id = fileMap.get(canonical(file))!;
    const text = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const options = compilerOptions(path.dirname(file));
    const imports = new Map<string, boolean>();
    const exports = new Set<string>();
    const addImport = (specifier: string, typeOnly: boolean) =>
      imports.set(specifier, (imports.get(specifier) ?? true) && typeOnly);
    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyNamedTypes =
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((item) => item.isTypeOnly);
        addImport(node.moduleSpecifier.text, !!clause?.isTypeOnly || !!onlyNamedTypes);
      } else if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const onlyTypes =
            node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly);
          addImport(node.moduleSpecifier.text, node.isTypeOnly || !!onlyTypes);
        }
        if (node.parent === source) {
          if (node.exportClause && ts.isNamedExports(node.exportClause))
            node.exportClause.elements.forEach((item) => exports.add(item.name.text));
          else if (node.exportClause && ts.isNamespaceExport(node.exportClause))
            exports.add(node.exportClause.name.text);
          else exports.add('*');
        }
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        addImport(node.moduleReference.expression.text, node.isTypeOnly);
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        addImport(node.argument.literal.text, true);
      } else if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        )
          addImport(node.arguments[0].text, false);
      }
      if (node.parent === source && ts.isExportAssignment(node)) exports.add('default');
      if (node.parent === source && ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
          if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
            exports.add('default');
          else if (ts.isVariableStatement(node)) {
            const collectNames = (name: ts.BindingName): void => {
              if (ts.isIdentifier(name)) exports.add(name.text);
              else
                name.elements.forEach((item) => {
                  if (ts.isBindingElement(item)) collectNames(item.name);
                });
            };
            node.declarationList.declarations.forEach((declaration) =>
              collectNames(declaration.name),
            );
          } else if ('name' in node && node.name && ts.isIdentifier(node.name as ts.Node))
            exports.add((node.name as ts.Identifier).text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    const external = new Set<string>();
    const unresolved = new Set<string>();
    const local = new Map<string, boolean>();
    for (const [specifier, typeOnly] of imports) {
      if (assetImport.test(specifier)) continue;
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      const target = resolved && fileMap.get(canonical(resolved.resolvedFileName));
      if (target) local.set(target, (local.get(target) ?? true) && typeOnly);
      else if (resolved && !resolved.isExternalLibraryImport) continue;
      else {
        const matchesAlias = Object.keys(options.paths ?? {}).some((alias) => {
          const star = alias.indexOf('*');
          return star < 0
            ? alias === specifier
            : specifier.startsWith(alias.slice(0, star)) &&
                specifier.endsWith(alias.slice(star + 1));
        });
        if (specifier.startsWith('.') || path.isAbsolute(specifier) || matchesAlias)
          unresolved.add(specifier);
        else
          external.add(
            specifier.startsWith('@')
              ? specifier.split('/').slice(0, 2).join('/')
              : specifier.startsWith('node:')
                ? specifier
                : specifier.split('/')[0],
          );
      }
    }
    for (const [target, typeOnly] of local) edges.push({ source: id, target, typeOnly });
    nodes.push({
      id,
      name: path.basename(file),
      directory: slash(path.dirname(id)),
      extension: path.extname(file).slice(1),
      lines: text ? text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0) : 0,
      size: Buffer.byteLength(text),
      exports: [...exports].sort(),
      external: [...external].sort(),
      unresolved: [...unresolved].sort(),
      importedBy: 0,
      imports: local.size,
      cycleId: null,
    });
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  edges.forEach((edge) => nodeMap.get(edge.target)!.importedBy++);
  const cycles = findCycles(
    nodes.map((node) => node.id),
    edges,
  );
  cycles.forEach((group, index) =>
    group.forEach((id) => {
      nodeMap.get(id)!.cycleId = index;
    }),
  );
  let name = path.basename(root);
  try {
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name.trim()) name = manifest.name;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      warnings.push('Could not read project name from package.json.');
  }
  return {
    project: {
      name,
      analyzedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      demo,
    },
    nodes,
    edges,
    cycles,
    warnings,
  };
}
