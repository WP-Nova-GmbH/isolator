import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { EvidenceService } from './evidence.service';
import { EvidenceController, SoaController } from './soa.controller';
import { SoaService } from './soa.service';

@Module({
  imports: [FilesModule],
  controllers: [SoaController, EvidenceController],
  providers: [SoaService, EvidenceService],
  exports: [SoaService],
})
export class SoaModule {}
