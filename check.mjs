import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, extname } from 'node:path';
import { parse } from '../vendor/acorn/dist/acorn.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BROWSER_GLOBALS = ['window', 'document', 'location', 'navigator', 'history', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'WebGL2RenderingContext', 'WebGLRenderingContext', 'KeyboardEvent', 'MouseEvent', 'WheelEvent', 'PointerEvent', 'FocusEvent', 'HTMLElement', 'HTMLCanvasElement', 'Image', 'ImageBitmap', 'createImageBitmap', 'OffscreenCanvas', 'getComputedStyle', 'matchMedia', 'localStorage', 'sessionStorage', 'AudioContext', 'ResizeObserver', 'Worker', 'ProgressEvent'];
const NODE_ONLY = ['process', 'Buffer', 'global', 'setImmediate', 'clearImmediate'];
const NODE_GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), 'arguments']);
const PAGE_GLOBALS = new Set([...[...NODE_GLOBALS].filter(n => !NODE_ONLY.includes(n)), ...BROWSER_GLOBALS]);
const problems = [];
const rel = f => relative(ROOT, f).replaceAll('\\', '/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(name))) out.push(p);
  }
  return out;
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const importMap = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;

function resolveSpecifier(spec, from) {
  if (spec.startsWith('.')) return resolve(dirname(from), spec);
  if (spec.startsWith('/')) return join(ROOT, spec);
  if (importMap[spec]) return join(ROOT, importMap[spec]);
  const prefix = Object.keys(importMap).filter(k => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return prefix ? join(ROOT, importMap[prefix], spec.slice(prefix.length)) : null;
}

const exportCache = new Map();
function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  if (/^export\s+default\b/m.test(src)) names.add('default');
  for (const m of src.matchAll(/^export\s*\{([\s\S]*?)\}/gm)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  for (const m of src.matchAll(/^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) for (const n of exportsOf(resolveSpecifier(m[1], file), seen)) names.add(n);
  exportCache.set(file, names);
  return names;
}

function stripCode(src, file) {
  let i = 0, out = '';
  const n = src.length;
  const flag = (at, what) => problems.push(`${rel(file)}:${lineOf(src, at)} ${what}`);
  let prev = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { flag(i, 'comment'); while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { flag(i, 'comment'); const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; out += '""'; prev = '"'; continue; }
    if (c === '`') {
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n' && /^\s*\/\//.test(src.slice(i + 1, src.indexOf('\n', i + 1)))) flag(i + 1, 'comment inside template string');
        if (src[i] === '$' && src[i + 1] === '{') { let depth = 1; i += 2; while (i < n && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; } continue; }
        i++;
      }
      i++; out += '""'; prev = '"'; continue;
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|new|delete|void|throw)$/.test(out.trimEnd()))) {
      i++;
      let cls = false;
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++;
      while (/[a-z]/.test(src[i] || '')) i++;
      out += '/r/'; prev = 'r'; continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const own = [...walk(join(ROOT, 'src'), ['.js']), ...walk(join(ROOT, 'tools'), ['.mjs']), join(ROOT, 'server.js')];
for (const f of own) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${rel(f)} syntax: ${(r.stderr.split('\n').find(l => l.includes('Error')) || r.stderr).trim()}`);
  const src = readFileSync(f, 'utf8');
  stripCode(src, f);
  if (!f.includes(`${join(ROOT, 'src')}`)) continue;
  for (const m of src.matchAll(/^import\s+(?:(\{[\s\S]*?\})|\*\s+as\s+\w+|\w+)?\s*(?:from\s*)?['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(m[2], f);
    if (!target || !existsSync(target)) { problems.push(`${rel(f)}:${lineOf(src, m.index)} import "${m[2]}" does not resolve`); continue; }
    if (!m[1]) continue;
    const available = exportsOf(target);
    for (const part of m[1].slice(1, -1).split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !available.has(name)) problems.push(`${rel(f)}:${lineOf(src, m.index)} "${name}" is not exported by ${m[2]}`);
    }
  }
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const target = resolveSpecifier(m[1], f);
    if (!target || !existsSync(target)) problems.push(`${rel(f)}:${lineOf(src, m.index)} dynamic import "${m[1]}" does not resolve`);
  }
}

const signature = fn => ({ max: fn.params.some(p => p.type === 'RestElement') ? Infinity : fn.params.length });
const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const usesArguments = (src, fn) => /\barguments\b/.test(src.slice(fn.body.start, fn.body.end));

const parsed = new Map();
for (const f of own) {
  const src = readFileSync(f, 'utf8');
  try { parsed.set(f, { src, ast: parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) }); } catch (e) { problems.push(`${rel(f)} parse: ${e.message}`); }
}

const exportedSigs = new Map();
for (const [f, { src, ast }] of parsed) {
  const sigs = new Map();
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue;
    const d = node.declaration;
    if (d.type === 'FunctionDeclaration') sigs.set(d.id.name, usesArguments(src, d) ? { max: Infinity } : signature(d));
    if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && isFn(v.init)) sigs.set(v.id.name, usesArguments(src, v.init) ? { max: Infinity } : signature(v.init));
  }
  exportedSigs.set(f, sigs);
}

function analyzeScopes(file, src, ast, globals) {
  const refs = [];
  const calls = [];
  const at = pos => `${rel(file)}:${lineOf(src, pos)}`;
  const mk = (parent, isFunction) => { const s = { parent, names: new Map() }; s.func = isFunction || !parent ? s : parent.func; return s; };
  const declare = (scope, name, kind, pos, sig = null) => { if (!scope.names.has(name)) scope.names.set(name, { kind, pos, sig }); };
  const declarePattern = (p, scope, kind, exprScope) => {
    if (!p) return;
    if (p.type === 'Identifier') declare(scope, p.name, kind, p.start);
    else if (p.type === 'ObjectPattern') for (const prop of p.properties) {
      if (prop.type === 'RestElement') declarePattern(prop.argument, scope, kind, exprScope);
      else { if (prop.computed) visit(prop.key, exprScope); declarePattern(prop.value, scope, kind, exprScope); }
    }
    else if (p.type === 'ArrayPattern') for (const el of p.elements) declarePattern(el, scope, kind, exprScope);
    else if (p.type === 'RestElement') declarePattern(p.argument, scope, kind, exprScope);
    else if (p.type === 'AssignmentPattern') { declarePattern(p.left, scope, kind, exprScope); visit(p.right, exprScope); }
    else visit(p, exprScope);
  };
  const fn = (node, scope) => {
    const s = mk(scope, true);
    if (node.type === 'FunctionExpression' && node.id) declare(s, node.id.name, 'function', -1);
    for (const p of node.params) declarePattern(p, s, 'param', s);
    if (node.body.type === 'BlockStatement') for (const st of node.body.body) visit(st, s);
    else visit(node.body, s);
  };
  const cls = (node, scope) => {
    visit(node.superClass, scope);
    const s = mk(scope, true);
    for (const m of node.body.body) visit(m, s);
  };
  function visit(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier': refs.push({ name: node.name, scope, pos: node.start }); return;
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          if (d.id.type === 'Identifier' && isFn(d.init)) declare(node.kind === 'var' ? scope.func : scope, d.id.name, node.kind, d.id.start, usesArguments(src, d.init) ? { max: Infinity } : signature(d.init));
          else declarePattern(d.id, node.kind === 'var' ? scope.func : scope, node.kind, scope);
          visit(d.init, scope);
        }
        return;
      case 'FunctionDeclaration': if (node.id) declare(scope, node.id.name, 'function', node.start, usesArguments(src, node) ? { max: Infinity } : signature(node)); fn(node, scope); return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': fn(node, scope); return;
      case 'ClassDeclaration': if (node.id) declare(scope, node.id.name, 'class', node.start); cls(node, scope); return;
      case 'ClassExpression': { const s = mk(scope, false); if (node.id) declare(s, node.id.name, 'class', -1); cls(node, s); return; }
      case 'ImportDeclaration': {
        const target = resolveSpecifier(node.source.value, file);
        for (const sp of node.specifiers) declare(scope, sp.local.name, 'import', -1, sp.type === 'ImportSpecifier' && exportedSigs.has(target) ? exportedSigs.get(target).get(sp.imported.name) || null : null);
        return;
      }
      case 'ExportNamedDeclaration': if (node.declaration) visit(node.declaration, scope); else if (!node.source) for (const sp of node.specifiers) visit(sp.local, scope); return;
      case 'ExportDefaultDeclaration': visit(node.declaration, scope); return;
      case 'ExportAllDeclaration': case 'BreakStatement': case 'ContinueStatement': case 'MetaProperty': return;
      case 'BlockStatement': case 'StaticBlock': { const s = mk(scope, node.type === 'StaticBlock'); for (const st of node.body) visit(st, s); return; }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': { const s = mk(scope, false); for (const k of ['init', 'left', 'test', 'update', 'right', 'body']) visit(node[k], s); return; }
      case 'SwitchStatement': { visit(node.discriminant, scope); const s = mk(scope, false); for (const c of node.cases) { visit(c.test, s); for (const st of c.consequent) visit(st, s); } return; }
      case 'CatchClause': { const s = mk(scope, false); declarePattern(node.param, s, 'param', s); for (const st of node.body.body) visit(st, s); return; }
      case 'MemberExpression': visit(node.object, scope); if (node.computed) visit(node.property, scope); return;
      case 'Property': case 'MethodDefinition': case 'PropertyDefinition': if (node.computed) visit(node.key, scope); visit(node.value, scope); return;
      case 'LabeledStatement': visit(node.body, scope); return;
      case 'CallExpression': if (node.callee.type === 'Identifier' && !node.arguments.some(a => a.type === 'SpreadElement')) calls.push({ node, scope }); break;
    }
    for (const [key, v] of Object.entries(node)) {
      if (key === 'type') continue;
      if (Array.isArray(v)) for (const c of v) visit(c, scope);
      else if (v && typeof v.type === 'string') visit(v, scope);
    }
  }
  const lookup = (name, scope) => { for (let s = scope; s; s = s.parent) if (s.names.has(name)) return { binding: s.names.get(name), owner: s }; return null; };
  const root = mk(null, true);
  for (const st of ast.body) visit(st, root);
  for (const r of refs) {
    const found = lookup(r.name, r.scope);
    if (!found) { if (!globals.has(r.name)) problems.push(`${at(r.pos)} "${r.name}" is not defined`); continue; }
    const { binding, owner } = found;
    if (['let', 'const', 'class'].includes(binding.kind) && r.pos < binding.pos && r.scope.func === owner.func) problems.push(`${at(r.pos)} "${r.name}" is used before its declaration`);
  }
  for (const { node, scope } of calls) {
    const found = lookup(node.callee.name, scope);
    const sig = found && found.binding.sig;
    if (sig && node.arguments.length > sig.max) problems.push(`${at(node.start)} "${node.callee.name}" is called with ${node.arguments.length} arguments but takes ${sig.max}`);
  }
}

for (const [f, { src, ast }] of parsed) analyzeScopes(f, src, ast, f.startsWith(join(ROOT, 'src')) ? PAGE_GLOBALS : NODE_GLOBALS);

for (const [spec, path] of Object.entries(importMap)) if (!existsSync(join(ROOT, path))) problems.push(`index.html import map "${spec}" -> ${path} is missing`);
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!existsSync(join(ROOT, m[1]))) problems.push(`index.html references missing ${m[1]}`);
if (/<!--/.test(html)) problems.push('index.html contains an HTML comment');
for (const line of readFileSync(join(ROOT, 'Start.bat'), 'utf8').split('\n')) if (/^\s*(rem\b|::)/i.test(line)) problems.push('Start.bat contains a comment');

const texts = [...own, ...walk(join(ROOT, 'src'), ['.css', '.html']), join(ROOT, 'index.html'), join(ROOT, 'Start.bat'), ...walk(ROOT, ['.md', '.txt']).filter(f => !f.includes(`${join(ROOT, 'vendor')}`) && !f.includes(`${join(ROOT, 'qa')}`) && !f.includes(`${join(ROOT, 'assets')}`))];
for (const f of texts) {
  const src = readFileSync(f, 'utf8');
  const m = /\p{Extended_Pictographic}/u.exec(src);
  if (m) problems.push(`${rel(f)}:${lineOf(src, m.index)} emoji "${m[0]}"`);
  if (f.endsWith('.css')) for (const c of src.matchAll(/\/\*/g)) problems.push(`${rel(f)}:${lineOf(src, c.index)} comment`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check: OK (${own.length} scripts, ${texts.length} text files)`);
