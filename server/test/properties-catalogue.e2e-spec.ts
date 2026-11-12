import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Priority } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, destroyProperty, type PropertyFixture } from './fixtures';

describe('PB-029 category and response-target administration', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Catalogue Hall');
    away = await createProperty(t.prisma, 'Other Catalogue Hall');
  });

  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  it('lets an admin read the complete catalogue, including inactive items and targets', async () => {
    const response = await t.as(home.admin).get('/properties/catalogue').expect(200);
    expect(response.body.categories).toHaveLength(2);
    expect(response.body.categories[0].items[0]).toMatchObject({
      name: expect.any(String),
      isActive: true,
    });
    expect(response.body.responseTargets).toHaveLength(4);
    await t.as(home.residents[0]).get('/properties/catalogue').expect(403);
    const awayResponse = await t.as(away.admin).get('/properties/catalogue').expect(200);
    expect(awayResponse.body.categories).toHaveLength(2);
    expect(awayResponse.body.categories[0].propertyId).toBe(away.property.id);
  });

  it('creates and renames categories, rejecting duplicates', async () => {
    const created = await t
      .as(home.admin)
      .post('/properties/fault-categories')
      .send({ name: 'Security' })
      .expect(201);
    expect(created.body.category).toMatchObject({ name: 'Security', propertyId: home.property.id });

    await t
      .as(home.admin)
      .post('/properties/fault-categories')
      .send({ name: 'Security' })
      .expect(409);

    const renamed = await t
      .as(home.admin)
      .patch(`/properties/fault-categories/${created.body.category.id}`)
      .send({ name: 'Security and access' })
      .expect(200);
    expect(renamed.body.category.name).toBe('Security and access');

    const categoryAudit = await t.prisma.auditLog.findMany({
      where: {
        propertyId: home.property.id,
        action: { in: ['fault_category.created', 'fault_category.renamed'] },
      },
      select: { action: true, actorId: true },
    });
    expect(categoryAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'fault_category.created', actorId: home.admin.id }),
        expect.objectContaining({ action: 'fault_category.renamed', actorId: home.admin.id }),
      ]),
    );

    const deleted = await t
      .as(home.admin)
      .delete(`/properties/fault-categories/${created.body.category.id}`)
      .expect(200);
    expect(deleted.body).toEqual({ deleted: true, id: created.body.category.id });
  });

  it('creates and deactivates fault items within a category', async () => {
    const created = await t
      .as(home.admin)
      .post(`/properties/fault-categories/${home.categories.Plumbing.id}/items`)
      .send({ name: 'Burst pipe', defaultPriority: Priority.URGENT })
      .expect(201);
    expect(created.body.item).toMatchObject({
      name: 'Burst pipe',
      defaultPriority: Priority.URGENT,
      isActive: true,
    });

    const updated = await t
      .as(home.admin)
      .patch(`/properties/fault-items/${created.body.item.id}`)
      .send({ isActive: false, defaultPriority: Priority.HIGH })
      .expect(200);
    expect(updated.body.item).toMatchObject({ isActive: false, defaultPriority: Priority.HIGH });

    const itemAudit = await t.prisma.auditLog.findMany({
      where: {
        propertyId: home.property.id,
        action: { in: ['fault_item.created', 'fault_item.updated'] },
      },
      select: { action: true, actorId: true },
    });
    expect(itemAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'fault_item.created', actorId: home.admin.id }),
        expect.objectContaining({ action: 'fault_item.updated', actorId: home.admin.id }),
      ]),
    );

    await t
      .as(home.admin)
      .delete(`/properties/fault-categories/${home.categories.Plumbing.id}`)
      .expect(409);

    await t
      .as(away.admin)
      .patch(`/properties/fault-items/${created.body.item.id}`)
      .send({ name: 'Not yours' })
      .expect(404);
  });

  it('creates and updates category-specific response targets', async () => {
    const created = await t
      .as(home.admin)
      .post('/properties/response-targets')
      .send({
        categoryId: home.categories.Plumbing.id,
        priority: Priority.LOW,
        respondWithinH: 20,
        resolveWithinH: 96,
      })
      .expect(201);
    expect(created.body.responseTarget).toMatchObject({
      propertyId: home.property.id,
      categoryId: home.categories.Plumbing.id,
      priority: Priority.LOW,
      respondWithinH: 20,
      resolveWithinH: 96,
    });

    await t
      .as(home.admin)
      .post('/properties/response-targets')
      .send({
        categoryId: home.categories.Plumbing.id,
        priority: Priority.LOW,
        respondWithinH: 30,
        resolveWithinH: 100,
      })
      .expect(409);

    const updated = await t
      .as(home.admin)
      .patch(`/properties/response-targets/${created.body.responseTarget.id}`)
      .send({
        priority: Priority.LOW,
        respondWithinH: 24,
        resolveWithinH: 120,
      })
      .expect(200);
    expect(updated.body.responseTarget).toMatchObject({ respondWithinH: 24, resolveWithinH: 120 });
    expect(updated.body.responseTarget.categoryId).toBe(home.categories.Plumbing.id);

    const targetAudit = await t.prisma.auditLog.findMany({
      where: {
        propertyId: home.property.id,
        action: { in: ['response_target.created', 'response_target.updated'] },
      },
      select: { action: true, actorId: true },
    });
    expect(targetAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'response_target.created', actorId: home.admin.id }),
        expect.objectContaining({ action: 'response_target.updated', actorId: home.admin.id }),
      ]),
    );

    await t
      .as(away.admin)
      .patch(`/properties/response-targets/${created.body.responseTarget.id}`)
      .send({
        categoryId: home.categories.Plumbing.id,
        priority: Priority.LOW,
        respondWithinH: 1,
        resolveWithinH: 1,
      })
      .expect(404);
  });
});
