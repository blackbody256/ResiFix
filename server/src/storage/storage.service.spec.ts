import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../config/config';
import { StorageService } from './storage.service';

const config = loadConfig({ DATABASE_URL: 'postgresql://x@localhost/x' });
const s3Error = (name: string, status: number) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

/** Fakes S3: HeadBucket and CreateBucket answer as given (undefined = success). */
function fakeS3(head?: Error, create?: Error) {
  return vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (command instanceof HeadBucketCommand && head) throw head;
    if (command instanceof CreateBucketCommand && create) throw create;
    return {};
  });
}
const sent = (spy: ReturnType<typeof fakeS3>) =>
  spy.mock.calls.map(([command]) => (command as object).constructor.name);

describe('StorageService startup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves an existing bucket alone', async () => {
    const send = fakeS3();
    await new StorageService(config).onModuleInit();
    expect(sent(send)).toEqual(['HeadBucketCommand']);
  });

  it('creates the bucket when it is missing', async () => {
    const send = fakeS3(s3Error('NotFound', 404));
    await new StorageService(config).onModuleInit();
    expect(sent(send)).toEqual(['HeadBucketCommand', 'CreateBucketCommand']);
  });

  it.each(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'])(
    'starts normally when another process created it first (%s)',
    async (name) => {
      fakeS3(s3Error('NotFound', 404), s3Error(name, 409));
      await expect(new StorageService(config).onModuleInit()).resolves.toBeUndefined();
    },
  );

  it('never blocks startup when storage is down or the bucket cannot be made', async () => {
    fakeS3(s3Error('TimeoutError', 0));
    await expect(new StorageService(config).onModuleInit()).resolves.toBeUndefined();
    vi.restoreAllMocks();
    fakeS3(s3Error('NotFound', 404), s3Error('AccessDenied', 403));
    await expect(new StorageService(config).onModuleInit()).resolves.toBeUndefined();
  });
});
