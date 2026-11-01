import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller';
import { FILE_STORAGES, FilesService, VIRUS_SCANNER } from './files.service';
import { createFileStorages, createVirusScanner } from './storage-config';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: FILE_STORAGES,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createFileStorages({
          STORAGE_DIR: config.get('STORAGE_DIR'),
          S3_BUCKET: config.get('S3_BUCKET'),
          S3_REGION: config.get('S3_REGION'),
          S3_ENDPOINT: config.get('S3_ENDPOINT'),
          S3_FORCE_PATH_STYLE: config.get('S3_FORCE_PATH_STYLE'),
          S3_ACCESS_KEY_ID: config.get('S3_ACCESS_KEY_ID'),
          S3_SECRET_ACCESS_KEY: config.get('S3_SECRET_ACCESS_KEY'),
        }),
    },
    {
      provide: VIRUS_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createVirusScanner({
          CLAMAV_HOST: config.get('CLAMAV_HOST'),
          CLAMAV_PORT: config.get('CLAMAV_PORT'),
        }),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
