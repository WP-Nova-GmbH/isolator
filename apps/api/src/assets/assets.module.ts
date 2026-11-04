import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AssetImportService } from './asset-import.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [FilesModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetImportService],
})
export class AssetsModule {}
