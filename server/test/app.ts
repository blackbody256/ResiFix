// Boots the real AppModule (global guards, error filter, Prisma, BullMQ queues) for HTTP tests.
//
//   const t = await startApp();
//   await t.as(user).get('/tickets').expect(200);
//   await t.close();
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

type Caller = Pick<User, 'id' | 'role' | 'propertyId'>;

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Unauthenticated requests: `t.anon().get('/health')`. Paths are relative to /api. */
  anon(): ApiClient;
  /** Requests as `user`, with a JWT signed by the app's own JwtService. */
  as(user: Caller): ApiClient;
  /** A BullMQ queue, to check what was scheduled: `t.queue(QUEUES.NOTIFICATIONS).getJobs()`. */
  queue(name: string): Queue;
  close(): Promise<void>;
}

export interface ApiClient {
  get(path: string): request.Test;
  post(path: string): request.Test;
  patch(path: string): request.Test;
  delete(path: string): request.Test;
}

export async function startApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.init();

  const server = app.getHttpServer();
  const jwt = app.get(JwtService);
  const client = (token?: string): ApiClient => {
    const auth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
    return {
      get: (path) => auth(request(server).get(`/api${path}`)),
      post: (path) => auth(request(server).post(`/api${path}`)),
      patch: (path) => auth(request(server).patch(`/api${path}`)),
      delete: (path) => auth(request(server).delete(`/api${path}`)),
    };
  };

  // Tokens are cached per user so a test file signs each one once.
  const tokens = new Map<string, string>();

  return {
    app,
    prisma: app.get(PrismaService),
    anon: () => client(),
    as: (user) => {
      let token = tokens.get(user.id);
      if (!token) {
        const payload: JwtPayload = { sub: user.id, role: user.role, propertyId: user.propertyId };
        token = jwt.sign(payload);
        tokens.set(user.id, token);
      }
      return client(token);
    },
    queue: (name) => app.get<Queue>(getQueueToken(name), { strict: false }),
    close: () => app.close(),
  };
}
