// Report photos: upload (POST /reporting/tickets/:id/photos) and presigned links in the ticket
// detail. Needs MinIO (`npm run infra:up`); tests use their own bucket, resifix-photos-test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ticket } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

/** The smallest valid PNG: 1x1 pixel. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cf000003010100c9fe92ef0000000049454e44ae426082',
  'hex',
);

describe('report photos', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;
  let mine: Ticket;
  let neighbours: Ticket;
  let elsewhere: Ticket;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Photo Hall');
    away = await createProperty(t.prisma, 'Other Photo Hall');
    mine = await createTicket(t.prisma, home, { reporter: home.residents[0] });
    neighbours = await createTicket(t.prisma, home, { reporter: home.residents[1] });
    elsewhere = await createTicket(t.prisma, away, { reporter: away.residents[0] });
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const upload = (caller: PropertyFixture['admin'], ticketId: string) =>
    t.as(caller).post(`/reporting/tickets/${ticketId}/photos`);

  it('stores a resident photo under the property and serves it through an expiring link', async () => {
    const res = await upload(home.residents[0], mine.id)
      .attach('photo', PNG, { filename: 'tap.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.photo).toEqual({
      id: expect.any(String),
      kind: 'REPORT',
      createdAt: expect.any(String),
    });

    const stored = await t.prisma.photo.findUniqueOrThrow({ where: { id: res.body.photo.id } });
    expect(stored.url).toMatch(
      new RegExp(`^properties/${home.property.id}/tickets/${mine.id}/[\\w-]+\\.png$`),
    );

    const detail = await t.as(home.residents[0]).get(`/tickets/${mine.id}`).expect(200);
    const [photo] = detail.body.ticket.photos;
    expect(photo.url).toMatch(/^https?:\/\/.+X-Amz-Signature=/);
    expect(new Date(photo.urlExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const image = await fetch(photo.url);
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
  });

  it("does not let a resident attach photos to someone else's ticket", async () => {
    for (const ticket of [neighbours, elsewhere]) {
      await upload(home.residents[0], ticket.id)
        .attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' })
        .expect(404);
    }
  });

  it('only residents upload report photos', async () => {
    await upload(home.custodian, mine.id)
      .attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' })
      .expect(403);
  });

  describe('GET /reporting/photos/:photoId/link', () => {
    let photoId: string;
    beforeAll(async () => {
      const res = await upload(home.residents[1], neighbours.id)
        .attach('photo', PNG, { filename: 'socket.png', contentType: 'image/png' })
        .expect(201);
      photoId = res.body.photo.id;
    });

    it('gives the reporter and staff of the property a working link', async () => {
      for (const caller of [home.residents[1], home.custodian, home.admin]) {
        const res = await t.as(caller).get(`/reporting/photos/${photoId}/link`).expect(200);
        expect(res.body).toEqual({ url: expect.any(String), expiresAt: expect.any(String) });
      }
    });

    it("hides another resident's photo, even in the same property", async () => {
      // Photos are taken inside someone's room: other residents must not see them.
      const res = await t
        .as(home.residents[0])
        .get(`/reporting/photos/${photoId}/link`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('hides photos from other properties', async () => {
      for (const caller of [away.residents[0], away.custodian, away.admin]) {
        await t.as(caller).get(`/reporting/photos/${photoId}/link`).expect(404);
      }
    });
  });

  it('rejects a missing file, a non-image and an oversized file', async () => {
    const missing = await upload(home.residents[0], mine.id).expect(400);
    expect(missing.body.error.code).toBe('BAD_REQUEST');

    await upload(home.residents[0], mine.id)
      .attach('photo', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })
      .expect(400);

    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const tooBig = await upload(home.residents[0], mine.id)
      .attach('photo', big, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
