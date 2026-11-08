// S3-compatible object storage (MinIO locally). Objects are private; clients only ever get
// short-lived presigned GET links (PB-007). Photo.url stores the object KEY, not a URL.
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/config';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  /** Signs URLs with the endpoint browsers can reach (e.g. localhost:9000 vs minio:9000). */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { endpoint, publicEndpoint, region, accessKeyId, secretAccessKey, forcePathStyle } =
      config.storage;
    const base = { region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } };
    this.s3 = new S3Client({ ...base, endpoint });
    this.signer = new S3Client({ ...base, endpoint: publicEndpoint });
    this.bucket = config.storage.bucket;
  }

  /** Creates the bucket on startup if it is missing. Never blocks startup if storage is down. */
  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) {
        this.logger.warn(`Object storage unreachable (${(err as Error).name}); photos disabled`);
        return;
      }
      await this.createBucket();
    }
  }

  /**
   * Several processes can start at once against an empty store (the API and the worker, or
   * parallel test files) and all try to create the bucket: losing that race is fine.
   */
  private async createBucket() {
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket ${this.bucket}`);
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return;
      this.logger.warn(`Could not create bucket ${this.bucket} (${name}); photos disabled`);
    }
  }

  photoKey(propertyId: string, ticketId: string, ext: string) {
    return `properties/${propertyId}/tickets/${ticketId}/${randomUUID()}.${ext}`;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  }

  async presignedGetUrl(key: string, ttlSeconds = this.config.storage.urlTtlSeconds) {
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
