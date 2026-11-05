import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SupplierImportService } from './supplier-import.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [FilesModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, SupplierImportService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
