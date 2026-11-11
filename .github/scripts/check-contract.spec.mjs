// Unit tests for check-contract.mjs, run by the server's unit project (`npm run test:unit`).
import { describe, expect, it } from 'vitest';
import {
  compare,
  normalisePath,
  report,
  routesFromSource,
  rowsFromContract,
} from './check-contract.mjs';

const CONTROLLER = `
import { Controller, Get, Post, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';

@Controller('widgets')
@Roles(Role.ADMIN)
export class WidgetsController {
  @Get()
  list() { return []; }

  @Public()
  @Get('public/:widgetId')
  show() { return {}; }

  @Post(':id/fix')
  @Roles(Role.CUSTODIAN, Role.ADMIN)
  fix() { return this.service.fix(); }

  @Patch(':id')
  @Roles(Role.RESIDENT)
  rate() {
    notImplemented('PB-999');
  }

  helper() {}
}
`;

const CONTRACT = `
# API

### Implemented

| Method | Path                    | Auth             | Request | Response |
| ------ | ----------------------- | ---------------- | ------- | -------- |
| GET    | \`/widgets\`              | ADMIN            | –       | \`{ a \\| b }\` |
| GET    | \`/widgets/public/:id\`   | public           | –       | x        |
| POST   | \`/widgets/:widgetId/fix\` | ADMIN, CUSTODIAN | –       | x        |

### Stubs (return 501 until built)

| Method | Path           | Role     | Backlog |
| ------ | -------------- | -------- | ------- |
| PATCH  | \`/widgets/:id\` | RESIDENT | PB-999  |

### Something else

| Method | Path | Auth |
| ------ | ---- | ---- |
| GET    | \`/ignored\` | any |
`;

const routes = () => routesFromSource('widgets.controller.ts', CONTROLLER);
const check = (markdown, source = CONTROLLER) =>
  compare(routesFromSource('widgets.controller.ts', source), rowsFromContract(markdown));
const failuresOf = (problems) =>
  Object.fromEntries(Object.entries(problems).filter(([, list]) => list.length));

describe('check-contract', () => {
  it('normalises paths and params', () => {
    expect(normalisePath('/tickets//:ticketId/')).toBe('/tickets/:param');
    expect(normalisePath('health')).toBe('/health');
  });

  it('reads routes, roles, @Public and stubs from a controller', () => {
    expect(routes()).toEqual([
      { method: 'GET', path: '/widgets', roles: 'ADMIN', stub: false, where: expect.any(String) },
      {
        method: 'GET',
        path: '/widgets/public/:param',
        roles: 'public',
        stub: false,
        where: expect.any(String),
      },
      {
        method: 'POST',
        path: '/widgets/:param/fix',
        roles: 'ADMIN, CUSTODIAN',
        stub: false,
        where: expect.any(String),
      },
      {
        method: 'PATCH',
        path: '/widgets/:param',
        roles: 'RESIDENT',
        stub: true,
        where: expect.any(String),
      },
    ]);
  });

  it('reads only the Implemented and Stubs tables', () => {
    const tables = rowsFromContract(CONTRACT);
    expect(tables.implemented.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /widgets',
      'GET /widgets/public/:param',
      'POST /widgets/:param/fix',
    ]);
    expect(tables.stubs.map((r) => `${r.method} ${r.path} ${r.roles}`)).toEqual([
      'PATCH /widgets/:param RESIDENT',
    ]);
  });

  it('passes when every route has a matching row', () => {
    const problems = check(CONTRACT);
    expect(failuresOf(problems)).toEqual({});
    expect(report(problems, { routes: 4, implemented: 3, stubs: 1 })).toEqual({
      ok: true,
      text: 'Contract OK: 4 routes in code, 3 Implemented rows, 1 Stubs rows.',
    });
  });

  it('fails on a route with no row', () => {
    const markdown = CONTRACT.replace(/^\| GET +\| `\/widgets` .*\n/m, '');
    expect(failuresOf(check(markdown))).toEqual({
      missingRows: [expect.stringContaining('GET /widgets (ADMIN) at widgets.controller.ts:')],
    });
  });

  it('fails on a row with no route', () => {
    const markdown = CONTRACT.replace('`/widgets/public/:id`', '`/widgets/open/:id`  ');
    expect(failuresOf(check(markdown))).toEqual({
      missingRows: [expect.stringContaining('GET /widgets/public/:param')],
      rowsWithoutRoute: [expect.stringContaining('GET /widgets/open/:id (Implemented table')],
    });
  });

  it('fails on a role mismatch', () => {
    const markdown = CONTRACT.replace('| ADMIN, CUSTODIAN |', '| CUSTODIAN        |');
    expect(failuresOf(check(markdown))).toEqual({
      roleMismatches: [
        expect.stringContaining('contract says "CUSTODIAN", code says "ADMIN, CUSTODIAN"'),
      ],
    });
  });

  it('fails on a Stubs row whose route is implemented', () => {
    const source = CONTROLLER.replace("notImplemented('PB-999');", 'return this.service.rate();');
    expect(failuresOf(check(CONTRACT, source))).toEqual({
      stubRowImplemented: [expect.stringContaining('PATCH /widgets/:id (Stubs table')],
    });
  });

  it('fails on an Implemented row whose route only calls notImplemented()', () => {
    const source = CONTROLLER.replace(
      'list() { return []; }',
      "list() { notImplemented('PB-1'); }",
    );
    const result = check(CONTRACT, source);
    expect(failuresOf(result)).toEqual({
      implementedRowIsStub: [expect.stringContaining('GET /widgets (Implemented table')],
    });
    const { ok, text } = report(result, { routes: 4, implemented: 3, stubs: 1 });
    expect(ok).toBe(false);
    expect(text).toContain('Implemented rows whose route only calls notImplemented()');
  });
});
