import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { FileStorage } from './file-storage';

export interface S3Settings {
  bucket: string;
  region: string;
  /** Set this for an S3-compatible service such as Hetzner Object Storage or MinIO. */
  endpoint?: string;
  forcePathStyle: boolean;
  /** Left out, the SDK finds credentials itself, for example from an instance role. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export class S3FileStorage implements FileStorage {
  readonly driver = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(settings: S3Settings) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
      credentials: settings.credentials,
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return Body as Readable;
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
