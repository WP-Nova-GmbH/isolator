import { ServiceUnavailableException } from '@nestjs/common';
import type { FileStorage, StorageDriver } from './file-storage';
import { LocalFileStorage } from './local-file-storage';
import { S3FileStorage } from './s3-file-storage';
import { ClamAvScanner } from './virus-scanner';

export interface FileStorages {
  /** Where new files go. */
  active: FileStorage;
  /** Reads each file from where it was stored, so moving to S3 keeps older files readable. */
  of(driver: StorageDriver): FileStorage;
}

type Env = Record<string, string | undefined>;

/** S3 when S3_BUCKET is set, otherwise the local disk. No outside service is required (ADR 0004). */
export function createFileStorages(env: Env): FileStorages {
  const local = new LocalFileStorage(env.STORAGE_DIR ?? './storage');
  const s3 = env.S3_BUCKET ? s3Storage(env.S3_BUCKET, env) : null;
  return {
    active: s3 ?? local,
    of(driver) {
      if (driver === 'local') return local;
      if (!s3) {
        throw new ServiceUnavailableException(
          'This file is stored in S3, but this install has no S3 settings. Set S3_BUCKET.',
        );
      }
      return s3;
    },
  };
}

/** Scans uploads when CLAMAV_HOST is set. Off otherwise, so ClamAV stays optional (ADR 0004). */
export function createVirusScanner(env: Env) {
  if (!env.CLAMAV_HOST) return null;
  return new ClamAvScanner(env.CLAMAV_HOST, Number(env.CLAMAV_PORT ?? 3310));
}

function s3Storage(bucket: string, env: Env) {
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = env;
  return new S3FileStorage({
    bucket,
    region: env.S3_REGION ?? 'eu-central-1',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}
