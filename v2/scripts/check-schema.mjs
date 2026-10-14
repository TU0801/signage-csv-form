#!/usr/bin/env node
/**
 * v2/src の Supabase 参照（表・列・RPC・Edge Function）を実DBと照合する。
 *
 * - 抽出: .from('x') / .rpc('x') / functions.invoke('x')、.select('...') の列、
 *   .insert/.update/.upsert のオブジェクトキー、.eq/.in/.order 等の第1引数の列
 * - 照合先: Management API の SELECT（information_schema.columns・pg_proc・storage.buckets）と
 *   リポジトリの supabase/functions/<name>
 * - 静的に解決できない参照は「未検査」として列挙する（黙って飛ばさない）
 *
 * 終了コード: 0=不一致なし / 1=存在しない表・列・関数あり / 2=トークン無し・API 失敗（照合していない）
 * トークン: 環境変数 SUPABASE_ACCESS_TOKEN か ~/.supabase/access-token。CI では走らせない前提。
 * 読み取り専用（SELECT だけを送る）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V2_ROOT = path.resolve(__dirname, '..');
// --src <dir> で走査対象を差し替えられる（スクリプト自体の確認用。既定は v2/src）
const srcArgIdx = process.argv.indexOf('--src');
const SRC = srcArgIdx > 0 ? path.resolve(process.argv[srcArgIdx + 1]) : path.join(V2_ROOT, 'src');
const FUNCTIONS_DIR = path.resolve(V2_ROOT, '..', 'supabase', 'functions');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'pdouwmjyswswfmzpfjzf';
const DEFAULT_SCHEMA = 'signage'; // createClient の db.schema
const KNOWN_SCHEMAS = ['signage', 'biz'];

// ---------------------------------------------------------------------------
// トークンと DB メタデータ
// ---------------------------------------------------------------------------

function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = path.join(os.homedir(), '.supabase', 'access-token');
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return '';
  }
}

async function query(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function loadDbMeta(token) {
  const schemas = KNOWN_SCHEMAS.map((s) => `'${s}'`).join(',');
  const [cols, procs, buckets] = await Promise.all([
    query(
      token,
      `SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN (${schemas})`,
    ),
    query(
      token,
      `SELECT n.nspname AS schema, p.proname AS name, coalesce(p.proargnames, '{}') AS argnames, p.proargmodes::text[] AS argmodes, pg_get_function_identity_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN (${schemas})`,
    ),
    query(token, `SELECT id FROM storage.buckets`),
  ]);
  /** @type {Map<string, Set<string>>} key = schema.table */
  const tables = new Map();
  for (const c of cols) {
    const key = `${c.table_schema}.${c.table_name}`;
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key).add(c.column_name);
  }
  /** @type {Map<string, {argnames: string[], args: string}[]>} key = schema.fn */
  const functions = new Map();
  for (const p of procs) {
    const key = `${p.schema}.${p.name}`;
    if (!functions.has(key)) functions.set(key, []);
    const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').replace(/[{}]/g, '').split(',').filter(Boolean));
    const allNames = toList(p.argnames);
    // proargnames には RETURNS TABLE / OUT の列名も入る。呼び出し側が渡せるのは IN・INOUT・VARIADIC だけ
    // （proargmodes が NULL なら全部 IN）
    const modes = p.argmodes == null ? null : toList(p.argmodes);
    const argnames = modes ? allNames.filter((_, i) => ['i', 'b', 'v'].includes(modes[i])) : allNames;
    functions.get(key).push({ argnames, args: p.args });
  }
  return { tables, functions, buckets: new Set(buckets.map((b) => b.id)) };
}

// ---------------------------------------------------------------------------
// ソース走査
// ---------------------------------------------------------------------------

function listSourceFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const isTestFile = (f) => /[/\\]__tests__[/\\]|\.(test|spec)\.tsx?$/.test(f);

const allFiles = listSourceFiles(SRC);
const targetFiles = allFiles.filter((f) => !isTestFile(f));
const excludedTests = allFiles.length - targetFiles.length;

const sources = new Map(
  targetFiles.map((f) => [f, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)]),
);

const unwrap = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e))) {
    e = e.expression;
  }
  return e;
};

/** 全ファイルの const 文字列・const オブジェクト（文字列プロパティ）を集める。同名が複数あれば曖昧として扱う */
const globalStrings = new Map(); // name -> string | null(ambiguous)
const globalObjects = new Map(); // name -> Map<prop, string> | null
const fileStrings = new Map(); // file -> Map<name, string>
const fileObjects = new Map(); // file -> Map<name, Map>

function addGlobal(map, name, value) {
  if (map.has(name)) map.set(name, null);
  else map.set(name, value);
}

for (const [file, sf] of sources) {
  const strs = new Map();
  const objs = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const declList = node.parent;
      const isConst = ts.isVariableDeclarationList(declList) && (declList.flags & ts.NodeFlags.Const) !== 0;
      const init = unwrap(node.initializer);
      if (isConst && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
        strs.set(node.name.text, init.text);
        addGlobal(globalStrings, node.name.text, init.text);
      } else if (isConst && ts.isObjectLiteralExpression(init)) {
        const m = new Map();
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
            const v = unwrap(p.initializer);
            if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) m.set(p.name.text, v.text);
          }
        }
        if (m.size > 0) {
          objs.set(node.name.text, m);
          addGlobal(globalObjects, node.name.text, m);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  fileStrings.set(file, strs);
  fileObjects.set(file, objs);
}

/** 式を文字列の候補集合に解決する。解決できなければ null */
function resolveStrings(expr, file) {
  const e = unwrap(expr);
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isIdentifier(e)) {
    const local = fileStrings.get(file).get(e.text);
    if (local !== undefined) return [local];
    const g = globalStrings.get(e.text);
    return g ? [g] : null;
  }
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
    const objName = e.expression.text;
    const obj = fileObjects.get(file).get(objName) ?? globalObjects.get(objName);
    const v = obj?.get(e.name.text);
    return v !== undefined ? [v] : null;
  }
  if (ts.isConditionalExpression(e)) {
    const a = resolveStrings(e.whenTrue, file);
    const b = resolveStrings(e.whenFalse, file);
    return a && b ? [...new Set([...a, ...b])] : null;
  }
  return null;
}

/**
 * 識別子が囲む関数の引数なら、その関数の呼び出し箇所（全ファイル）を返す。
 * 返り値: [{ file, call, args: Expression[] }]（呼び出しが無ければ []）。引数でなければ null
 */
function paramCallSites(ident) {
  if (!ts.isIdentifier(ident)) return null;
  let fn = ident.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  for (; fn; fn = fn.parent) {
    if (!ts.isFunctionLike(fn)) continue;
    const idx = fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === ident.text);
    if (idx < 0) continue;
    let name = null;
    if (fn.name && ts.isIdentifier(fn.name)) name = fn.name.text;
    else if (fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) name = fn.parent.name.text;
    if (!name) return null;
    const sites = [];
    for (const [file, sf] of sources) {
      const visit = (n) => {
        if (ts.isCallExpression(n)) {
          const callee = unwrap(n.expression);
          const calleeName = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
          if (calleeName === name) sites.push({ file, call: n, idx, args: n.arguments });
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    return { name, idx, fn, sites };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 照合
// ---------------------------------------------------------------------------

const errors = []; // { loc, msg }
const unchecked = []; // { loc, msg }
const checked = { tables: 0, columns: 0, functions: 0, edgeFunctions: 0, buckets: 0 };

const locOf = (file, node) => {
  const sf = sources.get(file);
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${path.relative(V2_ROOT, file)}:${line + 1}`;
};
const textOf = (file, node) => node.getText(sources.get(file)).replace(/\s+/g, ' ').slice(0, 80);

const FILTER_METHODS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'likeAllOf', 'likeAnyOf', 'ilikeAllOf', 'ilikeAnyOf',
  'is', 'in', 'contains', 'containedBy', 'overlaps', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte',
  'rangeAdjacent', 'textSearch', 'filter', 'not', 'order',
]);
const WRITE_METHODS = new Set(['insert', 'update', 'upsert']);
const BUILDER_METHODS = new Set([...FILTER_METHODS, ...WRITE_METHODS, 'select', 'match', 'or', 'delete']);

/** 列名から JSON パス・キャストを外す。解決できない形なら null */
function baseColumn(raw) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:->>?[A-Za-z0-9_']+)*)(?:::[A-Za-z0-9_]+)?$/.exec(raw.trim());
  return m ? m[1] : null;
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function checkColumn(ctx, col, loc, how) {
  const cols = meta.tables.get(`${ctx.schema}.${ctx.table}`);
  if (!cols) return; // 表の不在は from() で報告済み
  checked.columns++;
  if (!cols.has(col)) errors.push({ loc, msg: `列なし: ${ctx.schema}.${ctx.table}.${col}（${how}）` });
}

function checkSelectString(ctx, sel, loc) {
  for (let item of splitTopLevel(sel)) {
    if (item.startsWith('...')) item = item.slice(3).trim();
    if (item === '*') continue;
    const embed = /^(?:([A-Za-z_][A-Za-z0-9_]*)\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)((?:![A-Za-z_][A-Za-z0-9_]*)*)\s*\(([\s\S]*)\)$/.exec(item);
    if (embed) {
      const name = embed[2];
      if (meta.tables.has(`${ctx.schema}.${name}`)) {
        checked.tables++;
        checkSelectString({ schema: ctx.schema, table: name }, embed[4], loc);
      } else {
        unchecked.push({ loc, msg: `select の埋め込み "${name}(...)" は表名でないため先の表を特定できない（${ctx.table}）` });
      }
      continue;
    }
    const aliased = /^(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*)?(.+)$/.exec(item)[1];
    const col = baseColumn(aliased);
    if (col) checkColumn(ctx, col, loc, `select '${item}'`);
    else unchecked.push({ loc, msg: `select の項目 "${item}" を解釈できない（${ctx.table}）` });
  }
}

/** オブジェクトリテラル（または同一ファイルの変数初期化子）のキーを取り出す */
function objectKeys(expr, file) {
  let e = unwrap(expr);
  if (ts.isIdentifier(e)) {
    const decl = findVarInitializer(file, e.text, e);
    if (!decl) return { keys: null, reason: `変数 ${e.text} の中身を静的に辿れない` };
    e = unwrap(decl);
  }
  if (ts.isArrayLiteralExpression(e)) {
    const keys = [];
    let partial = null;
    for (const el of e.elements) {
      const r = objectKeys(el, file);
      if (!r.keys) return r;
      keys.push(...r.keys);
      partial = partial || r.partial;
    }
    return { keys, partial };
  }
  if (!ts.isObjectLiteralExpression(e)) return { keys: null, reason: `引数が ${ts.SyntaxKind[e.kind]}` };
  const keys = [];
  let partial = null;
  for (const p of e.properties) {
    if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      keys.push(p.name.text);
    } else if (ts.isSpreadAssignment(p)) {
      partial = `スプレッド ...${p.expression.getText()} のキーは未検査`;
    } else {
      partial = `計算キー ${p.getText().slice(0, 40)} は未検査`;
    }
  }
  return { keys, partial };
}

function findVarInitializer(file, name, fromNode) {
  // 参照位置を囲む関数から外側へ、同名の変数宣言を探す
  let scope = fromNode.parent;
  while (scope) {
    let found = null;
    const visit = (n) => {
      if (found) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found = n.initializer;
      else ts.forEachChild(n, visit);
    };
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) visit(scope);
    if (found) return found;
    scope = scope.parent;
  }
  return null;
}

function handleBuilderCall(ctx, method, call, file) {
  const loc = locOf(file, call);
  const [a0, a1] = call.arguments;
  if (method === 'select') {
    if (!a0) return;
    const s = resolveStrings(a0, file);
    if (!s) unchecked.push({ loc, msg: `select の引数を静的に解決できない: ${textOf(file, a0)}` });
    else s.forEach((x) => checkSelectString(ctx, x, loc));
    return;
  }
  if (WRITE_METHODS.has(method)) {
    if (!a0) return;
    const r = objectKeys(a0, file);
    if (!r.keys) unchecked.push({ loc, msg: `.${method} のキーを静的に取れない（${r.reason}）: ${textOf(file, a0)}` });
    else r.keys.forEach((k) => checkColumn(ctx, k, loc, `.${method} のキー`));
    if (r.partial) unchecked.push({ loc, msg: `.${method}: ${r.partial}` });
    if (method === 'upsert' && a1 && ts.isObjectLiteralExpression(unwrap(a1))) {
      for (const p of unwrap(a1).properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText() === 'onConflict') {
          const s = resolveStrings(p.initializer, file);
          if (!s) unchecked.push({ loc, msg: `onConflict を静的に解決できない` });
          else s.flatMap((x) => x.split(',')).forEach((c) => checkColumn(ctx, c.trim(), loc, 'onConflict'));
        }
      }
    }
    return;
  }
  if (method === 'match') {
    if (!a0) return;
    const r = objectKeys(a0, file);
    if (!r.keys) unchecked.push({ loc, msg: `.match のキーを静的に取れない（${r.reason}）` });
    else r.keys.forEach((k) => checkColumn(ctx, k, loc, '.match のキー'));
    return;
  }
  if (method === 'or') {
    const s = a0 && resolveStrings(a0, file);
    if (!s) {
      unchecked.push({ loc, msg: `.or の条件文字列を静的に解決できない: ${a0 ? textOf(file, a0) : ''}` });
      return;
    }
    for (const cond of s.flatMap(splitTopLevel)) {
      const col = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(cond);
      if (col && !cond.startsWith('and(') && !cond.startsWith('or(')) checkColumn(ctx, col[1], loc, `.or '${cond}'`);
      else unchecked.push({ loc, msg: `.or の条件 "${cond}" を解釈できない` });
    }
    return;
  }
  if (FILTER_METHODS.has(method)) {
    if (!a0) return;
    const s = resolveStrings(a0, file);
    if (!s) {
      unchecked.push({ loc, msg: `.${method} の列名を静的に解決できない: ${textOf(file, a0)}` });
      return;
    }
    for (const raw of s) {
      if (raw.includes('.')) {
        unchecked.push({ loc, msg: `.${method}('${raw}') は埋め込み先の列（未検査）` });
        continue;
      }
      const col = baseColumn(raw);
      if (col) checkColumn(ctx, col, loc, `.${method}('${raw}')`);
      else unchecked.push({ loc, msg: `.${method} の列名 "${raw}" を解釈できない` });
    }
  }
}

/** call から上方向にメソッドチェーンを辿る。チェーン最上位のノードを返す */
function walkChainUp(ctx, startCall, file, handled) {
  let node = startCall;
  for (;;) {
    const pa = node.parent;
    if (!pa || !ts.isPropertyAccessExpression(pa) || pa.expression !== node) break;
    const call = pa.parent;
    if (!call || !ts.isCallExpression(call) || call.expression !== pa) break;
    handled.add(call);
    if (ctx) handleBuilderCall(ctx, pa.name.text, call, file);
    node = call;
  }
  // await を挟む場合も含め、変数への代入先を返す
  let top = node;
  while (top.parent && (ts.isAwaitExpression(top.parent) || ts.isParenthesizedExpression(top.parent))) top = top.parent;
  return top;
}

/** チェーンの根（最初の識別子・this など）と、途中の .schema('x') を取る */
function chainRoot(expr) {
  let e = expr;
  let schema = null;
  for (;;) {
    e = unwrap(e);
    if (ts.isCallExpression(e)) {
      if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'schema' && !schema) {
        const a = e.arguments[0];
        schema = a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : '?';
      }
      e = e.expression;
    } else if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
      e = e.expression;
    } else break;
  }
  return { root: e, schema };
}

function checkRpc(schema, nameExpr, argsExpr, file, loc, argsUnknown) {
  const names = nameExpr && resolveStrings(nameExpr, file);
  if (!names) {
    reportUnresolved(nameExpr, file, loc, 'rpc の関数名');
    return;
  }
  for (const fn of names) {
    checked.functions++;
    const defs = meta.functions.get(`${schema}.${fn}`);
    if (!defs) {
      errors.push({ loc, msg: `関数なし: ${schema}.${fn}` });
      continue;
    }
    if (argsUnknown) {
      unchecked.push({ loc, msg: `rpc ${fn} の引数キーは別の関数の引数で、静的に辿れない` });
      continue;
    }
    if (!argsExpr) continue;
    const r = objectKeys(argsExpr, file);
    if (!r.keys) {
      unchecked.push({ loc, msg: `rpc ${fn} の引数キーを静的に取れない（${r.reason}）` });
      continue;
    }
    if (r.partial) unchecked.push({ loc, msg: `rpc ${fn}: ${r.partial}` });
    if (!defs.some((d) => r.keys.every((k) => d.argnames.includes(k)))) {
      errors.push({
        loc,
        msg: `rpc ${schema}.${fn} の引数名が合わない: {${r.keys.join(', ')}} / 定義 (${defs.map((d) => d.args).join(' | ')})`,
      });
    }
  }
}

/** 解決できない名前の報告。既知の定数オブジェクトに無いプロパティ（TABLES.xxx の消し忘れ等）は不在として扱う */
function reportUnresolved(expr, file, loc, what) {
  const e = expr && unwrap(expr);
  if (e && ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
    const obj = fileObjects.get(file).get(e.expression.text) ?? globalObjects.get(e.expression.text);
    if (obj && !obj.has(e.name.text)) {
      errors.push({ loc, msg: `${what}: 定数 ${e.expression.text} に ${e.name.text} が無い` });
      return;
    }
  }
  unchecked.push({ loc, msg: `${what}を静的に解決できない: ${expr ? textOf(file, expr) : '(引数なし)'}` });
}

let meta;

async function main() {
  // supabase.ts の TABLES を表示（並行編集のどちらの状態で走らせたかの記録）
  const tablesObj = globalObjects.get('TABLES');
  console.log('# check:schema');
  console.log(`対象: ${path.relative(process.cwd(), SRC) || 'src'} 配下 ${targetFiles.length} ファイル（テスト ${excludedTests} ファイルは supabase をモックするため除外）`);
  console.log(`TABLES.buildingVendors = ${tablesObj ? JSON.stringify(tablesObj.get('buildingVendors')) : '(TABLES 未検出)'}`);

  const token = readToken();
  if (!token) {
    console.error(
      'Supabase のアクセストークンがありません。SUPABASE_ACCESS_TOKEN か ~/.supabase/access-token を用意してください（CI では実行しない前提）。照合は行っていません。',
    );
    process.exit(2);
  }
  try {
    meta = await loadDbMeta(token);
  } catch (e) {
    console.error(`DB メタデータの取得に失敗しました。照合は行っていません: ${e.message}`);
    process.exit(2);
  }

  const queryVars = new Map(); // file -> Map<varName, ctx>
  const handled = new Set();

  for (const [file, sf] of sources) {
    const vars = new Map();
    queryVars.set(file, vars);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const recv = node.expression.expression;
        const loc = locOf(file, node);
        const { root, schema: chainSchema } = chainRoot(recv);
        const rootName = ts.isIdentifier(root) ? root.text : null;
        const recvText = unwrap(recv).getText(sf);

        if (method === 'from' && rootName !== 'Array' && rootName !== 'Object') {
          if (/\.storage$/.test(recvText)) {
            const s = resolveStrings(node.arguments[0], file);
            if (!s) unchecked.push({ loc, msg: `storage.from の引数を静的に解決できない: ${textOf(file, node.arguments[0])}` });
            for (const b of s ?? []) {
              checked.buckets++;
              if (!meta.buckets.has(b)) errors.push({ loc, msg: `Storage バケットなし: ${b}` });
            }
            walkChainUp(null, node, file, handled);
          } else if (rootName === 'supabase') {
            const schema = chainSchema || DEFAULT_SCHEMA;
            const names = resolveStrings(node.arguments[0], file);
            if (!names) {
              reportUnresolved(node.arguments[0], file, loc, 'from の表名（後続の列も未検査）');
              walkChainUp(null, node, file, handled);
            } else {
              for (const t of names) {
                checked.tables++;
                if (!meta.tables.has(`${schema}.${t}`)) errors.push({ loc, msg: `表なし: ${schema}.${t}` });
              }
              const ctxs = names.map((t) => ({ schema, table: t }));
              let top = null;
              for (const ctx of ctxs) top = walkChainUp(ctx, node, file, handled);
              // let q = supabase.from(...)... → 後で q.eq(...) を同じ表として照合する
              if (top && ctxs.length === 1) {
                const p = top.parent;
                if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) vars.set(p.name.text, ctxs[0]);
                if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) {
                  vars.set(p.left.text, ctxs[0]);
                }
              }
            }
          } else {
            unchecked.push({ loc, msg: `supabase 以外のレシーバの .from（${recvText.slice(0, 40)}）` });
          }
        } else if (method === 'rpc' && rootName === 'supabase') {
          const schema = chainSchema || DEFAULT_SCHEMA;
          // 関数名・引数がラッパー関数の引数なら、ラッパーの呼び出し箇所ごとに照合する
          const nameArg = unwrap(node.arguments[0]);
          const wrapper = resolveStrings(nameArg, file) ? null : paramCallSites(nameArg);
          if (wrapper) {
            const argParam = node.arguments[1] && paramCallSites(unwrap(node.arguments[1]));
            if (wrapper.sites.length === 0) {
              unchecked.push({ loc, msg: `rpc の関数名は ${wrapper.name}() の引数だが、呼び出し箇所が無い` });
            }
            const argsFromSameWrapper = !!argParam && argParam.name === wrapper.name;
            for (const site of wrapper.sites) {
              const siteLoc = `${locOf(site.file, site.call)} → ${loc}`;
              if (argsFromSameWrapper) {
                checkRpc(schema, site.args[wrapper.idx], site.args[argParam.idx], site.file, siteLoc, false);
              } else {
                // 引数オブジェクトはラッパー内の式で照合する（別関数の引数なら未検査）
                checkRpc(schema, site.args[wrapper.idx], argParam ? undefined : node.arguments[1], site.file, siteLoc, !!argParam);
              }
            }
          } else {
            checkRpc(schema, node.arguments[0], node.arguments[1], file, loc, false);
          }
          walkChainUp(null, node, file, handled);
        } else if (method === 'invoke' && /\.functions$/.test(recvText) && rootName === 'supabase') {
          const names = resolveStrings(node.arguments[0], file);
          if (!names) unchecked.push({ loc, msg: `functions.invoke の関数名を静的に解決できない: ${textOf(file, node.arguments[0])}` });
          for (const fn of names ?? []) {
            checked.edgeFunctions++;
            if (!fs.existsSync(path.join(FUNCTIONS_DIR, fn))) errors.push({ loc, msg: `Edge Function なし: supabase/functions/${fn}` });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // 2周目: 変数に入れたクエリ（q = q.eq(...) など）と、どの表か辿れないビルダー呼び出し
  for (const [file, sf] of sources) {
    const vars = queryVars.get(file);
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        !handled.has(node) &&
        BUILDER_METHODS.has(node.expression.name.text) &&
        node.arguments.length > 0
      ) {
        const recv = unwrap(node.expression.expression);
        if (ts.isIdentifier(recv) && vars.has(recv.text)) {
          handled.add(node);
          handleBuilderCall(vars.get(recv.text), node.expression.name.text, node, file);
          walkChainUp(vars.get(recv.text), node, file, handled);
        } else {
          const { root } = chainRoot(recv);
          const a0 = unwrap(node.arguments[0]);
          const stringy = ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isObjectLiteralExpression(a0);
          // 文字列・オブジェクトを取るビルダー名の呼び出しで、表を辿れないものは未検査として残す
          if (stringy && !(ts.isIdentifier(root) && (root.text === 'Array' || root.text === 'Object'))) {
            unchecked.push({
              loc: locOf(file, node),
              msg: `.${node.expression.name.text}(${textOf(file, a0)}) の対象表を辿れない（レシーバ ${recv.getText(sf).slice(0, 40)}）`,
            });
            handled.add(node);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const uniq = (arr) => [...new Map(arr.map((x) => [`${x.loc} ${x.msg}`, x])).values()];
  const errs = uniq(errors);
  const unch = uniq(unchecked);

  console.log(
    `照合数: 表 ${checked.tables} / 列 ${checked.columns} / RPC ${checked.functions} / Edge Function ${checked.edgeFunctions} / バケット ${checked.buckets}`,
  );
  console.log(`\n## 存在しない参照 (${errs.length})`);
  for (const e of errs) console.log(`- ${e.loc}  ${e.msg}`);
  console.log(`\n## 未検査（静的に解決できない） (${unch.length})`);
  for (const u of unch) console.log(`- ${u.loc}  ${u.msg}`);

  process.exit(errs.length > 0 ? 1 : 0);
}

main();
