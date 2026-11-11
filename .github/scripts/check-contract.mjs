// Checks that docs/api-contract.md matches the routes in the code. Run with `npm run check:contract`.
//
// Routes come from every server/src/**/*.controller.ts: the @Controller prefix plus the method
// decorator, with params normalised (`:id` and `:ticketId` compare equal), roles from @Roles on the
// handler or else the class, @Public, and whether the handler only calls notImplemented().
// Rows come from the "Implemented" and "Stubs" tables of the contract.
//
// It fails, listing each problem, on:
//   - a route with no row
//   - a row with no route
//   - a row whose roles differ from the code
//   - a Stubs row whose route is implemented
//   - an Implemented row whose route only calls notImplemented()
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);
const CONTRACT_FILE = 'docs/api-contract.md';
const CONTROLLER_DIR = 'server/src';

/** `/a//b/:ticketId/` -> `/a/b/:param`, so paths compare by shape, not param name. */
export function normalisePath(raw) {
  const clean = `/${raw}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
  return clean.replace(/:[A-Za-z0-9_]+/g, ':param');
}

/** `CUSTODIAN, ADMIN` -> `ADMIN, CUSTODIAN`, so role lists compare regardless of order. */
const roleKey = (roles) => [...roles].sort().join(', ');

const decoratorsOf = (node) => (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []);

function decoratorCall(decorator) {
  const expr = decorator.expression;
  if (!ts.isCallExpression(expr) || !ts.isIdentifier(expr.expression)) return null;
  return { name: expr.expression.text, args: expr.arguments };
}

/** String paths in a decorator argument: 'x', ['x', 'y'], or { path: 'x' }. None means ''. */
function pathsFrom(arg) {
  if (!arg) return [''];
  if (ts.isStringLiteralLike(arg)) return [arg.text];
  if (ts.isArrayLiteralExpression(arg)) return arg.elements.flatMap((el) => pathsFrom(el));
  if (ts.isObjectLiteralExpression(arg)) {
    const prop = arg.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'path',
    );
    return prop ? pathsFrom(prop.initializer) : [''];
  }
  return [''];
}

/** `Role.ADMIN` -> `ADMIN`; a string literal stays as written. */
const roleName = (arg) =>
  ts.isPropertyAccessExpression(arg) ? arg.name.text : arg.getText().replace(/['"]/g, '');

function accessOf(decorators) {
  const calls = decorators.map(decoratorCall).filter(Boolean);
  if (calls.some((c) => c.name === 'Public')) return ['public'];
  const roles = calls.find((c) => c.name === 'Roles');
  return roles ? roles.args.map(roleName) : null;
}

/** True when the handler body is a single `notImplemented(...)` call (or `return` of one). */
function onlyCallsNotImplemented(method) {
  const statements = method.body?.statements ?? [];
  if (statements.length !== 1) return false;
  const [statement] = statements;
  const expr = ts.isExpressionStatement(statement)
    ? statement.expression
    : ts.isReturnStatement(statement) || ts.isThrowStatement(statement)
      ? statement.expression
      : undefined;
  return (
    !!expr &&
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'notImplemented'
  );
}

/** Routes in one controller file: [{ method, path, roles, stub, where }]. */
export function routesFromSource(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const routes = [];
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  for (const cls of source.statements.filter(ts.isClassDeclaration)) {
    const classDecorators = decoratorsOf(cls);
    const controller = classDecorators
      .map(decoratorCall)
      .find((call) => call?.name === 'Controller');
    if (!controller) continue;
    const prefixes = pathsFrom(controller.args[0]);
    const classAccess = accessOf(classDecorators);

    for (const member of cls.members.filter(ts.isMethodDeclaration)) {
      const decorators = decoratorsOf(member);
      const http = decorators.map(decoratorCall).find((call) => HTTP_DECORATORS.has(call?.name));
      if (!http) continue;
      const roles = accessOf(decorators) ?? classAccess ?? ['any'];
      for (const prefix of prefixes) {
        for (const sub of pathsFrom(http.args[0])) {
          routes.push({
            method: http.name.toUpperCase(),
            path: normalisePath(`${prefix}/${sub}`),
            roles: roleKey(roles),
            stub: onlyCallsNotImplemented(member),
            where: `${fileName}:${lineOf(member)}`,
          });
        }
      }
    }
  }
  return routes;
}

/** Splits a Markdown table row on unescaped pipes. */
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

/** Rows of the "Implemented" and "Stubs" tables: { implemented: Row[], stubs: Row[] }. */
export function rowsFromContract(markdown, fileName = CONTRACT_FILE) {
  const tables = { implemented: [], stubs: [] };
  let section = null;
  let columns = null;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const title = heading[1].trim().toLowerCase();
      section = title.startsWith('implemented')
        ? 'implemented'
        : title.startsWith('stubs')
          ? 'stubs'
          : null;
      columns = null;
      return;
    }
    if (!section) return;
    if (!line.trim().startsWith('|')) {
      columns = null; // any other line ends the table; the next table brings its own header
      return;
    }
    const row = cells(line);
    if (!columns) {
      const lower = row.map((c) => c.toLowerCase());
      columns = {
        method: lower.indexOf('method'),
        path: lower.indexOf('path'),
        roles: lower.findIndex((c) => c === 'auth' || c === 'role' || c === 'roles'),
      };
      return;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) return; // separator row
    const rawPath = (row[columns.path] ?? '').replace(/`/g, '').split('?')[0].trim();
    tables[section].push({
      method: (row[columns.method] ?? '').toUpperCase(),
      path: normalisePath(rawPath),
      shownPath: rawPath,
      roles: roleKey((row[columns.roles] ?? '').split(',').map((r) => r.trim())),
      where: `${fileName}:${index + 1}`,
    });
  });
  return tables;
}

/** Every mismatch between routes and rows, grouped by kind. Empty groups mean the check passes. */
export function compare(routes, tables) {
  const key = (x) => `${x.method} ${x.path}`;
  const routeByKey = new Map(routes.map((r) => [key(r), r]));
  const rows = [
    ...tables.implemented.map((row) => ({ ...row, table: 'Implemented' })),
    ...tables.stubs.map((row) => ({ ...row, table: 'Stubs' })),
  ];
  const rowKeys = new Set(rows.map(key));
  const problems = {
    missingRows: [],
    rowsWithoutRoute: [],
    roleMismatches: [],
    stubRowImplemented: [],
    implementedRowIsStub: [],
  };

  for (const route of routes) {
    if (!rowKeys.has(key(route))) {
      problems.missingRows.push(`${key(route)} (${route.roles}) at ${route.where}`);
    }
  }
  for (const row of rows) {
    const route = routeByKey.get(key(row));
    const label = `${row.method} ${row.shownPath} (${row.table} table, ${row.where})`;
    if (!route) {
      problems.rowsWithoutRoute.push(label);
      continue;
    }
    if (route.roles !== row.roles) {
      problems.roleMismatches.push(
        `${label}: contract says "${row.roles}", code says "${route.roles}" at ${route.where}`,
      );
    }
    if (row.table === 'Stubs' && !route.stub) {
      problems.stubRowImplemented.push(`${label}: implemented at ${route.where}`);
    }
    if (row.table === 'Implemented' && route.stub) {
      problems.implementedRowIsStub.push(`${label}: only calls notImplemented() at ${route.where}`);
    }
  }
  return problems;
}

const HEADINGS = {
  missingRows: 'Routes missing from the contract (add a row in the PR that adds the route)',
  rowsWithoutRoute: 'Contract rows with no matching route (fix the method or path, or remove)',
  roleMismatches: 'Role mismatches between the contract and @Roles/@Public',
  stubRowImplemented: 'Stubs rows whose route is implemented (move the row to Implemented)',
  implementedRowIsStub: 'Implemented rows whose route only calls notImplemented() (move to Stubs)',
};

/** Human-readable report; `ok` is false when any group has entries. */
export function report(problems, counts) {
  const failing = Object.entries(problems).filter(([, list]) => list.length);
  if (!failing.length) {
    return {
      ok: true,
      text: `Contract OK: ${counts.routes} routes in code, ${counts.implemented} Implemented rows, ${counts.stubs} Stubs rows.`,
    };
  }
  const lines = [`Contract check failed: ${CONTRACT_FILE} does not match the controllers.`];
  for (const [kind, list] of failing) {
    lines.push('', `${HEADINGS[kind]}:`, ...list.map((item) => `  - ${item}`));
  }
  lines.push(
    '',
    `Counted ${counts.routes} routes in code, ${counts.implemented} Implemented rows, ${counts.stubs} Stubs rows.`,
  );
  return { ok: false, text: lines.join('\n') };
}

export function checkRepo(root) {
  const dir = path.join(root, CONTROLLER_DIR);
  const files = fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.controller.ts'))
    .sort();
  const routes = files.flatMap((file) =>
    routesFromSource(
      path.posix.join(CONTROLLER_DIR, file.split(path.sep).join('/')),
      fs.readFileSync(path.join(dir, file), 'utf8'),
    ),
  );
  const tables = rowsFromContract(fs.readFileSync(path.join(root, CONTRACT_FILE), 'utf8'));
  return report(compare(routes, tables), {
    routes: routes.length,
    implemented: tables.implemented.length,
    stubs: tables.stubs.length,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = checkRepo(process.cwd());
  (result.ok ? console.log : console.error)(result.text);
  process.exitCode = result.ok ? 0 : 1;
}
