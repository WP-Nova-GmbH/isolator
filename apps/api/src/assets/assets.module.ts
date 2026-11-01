import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [SuppliersModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
