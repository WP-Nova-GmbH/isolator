import { randomUUID } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3FileStorage } from './s3-file-storage';

// Runs against a real S3 API: `docker compose --profile s3 up -d minio`, then set TEST_S3_ENDPOINT.
const endpoint = process.env.TEST_S3_ENDPOINT;
const credentials = { accessKeyId: 'isolator', secretAccessKey: 'isolator-dev-only' };
const bucket = `isolator-test-${randomUUID()}`;

describe.skipIf(!endpoint)('S3FileStorage', () => {
  const settings = { bucket, region: 'eu-central-1', endpoint, forcePathStyle: true, credentials };
  const storage = new S3FileStorage(settings);

  beforeAll(async () => {
    const client = new S3Client(settings);
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  it('stores, reads and deletes an object', async () => {
    const key = `org/${randomUUID()}`;
    await storage.put(key, Buffer.from('hello'), 'text/plain');
    expect(await text(await storage.get(key))).toBe('hello');
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });
});
