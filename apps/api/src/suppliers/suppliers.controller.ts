import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Upload } from '../files/files.service';
import { csvFile, CsvUpload } from '../imports/register-import';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { SupplierImportService } from './supplier-import.service';
import {
  supplierFileInput,
  supplierInput,
  supplierReviewInput,
  SuppliersService,
} from './suppliers.service';

const linkInput = z.object({ id: z.uuid('Choose one from the list.') });

@Controller('suppliers')
@UseGuards(MemberGuard)
export class SuppliersController {
  constructor(
    @Inject(SuppliersService) private readonly suppliers: SuppliersService,
    @Inject(SupplierImportService) private readonly imports: SupplierImportService,
  ) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    return this.suppliers.list(member.organizationId, state === 'ended' ? 'ended' : 'active');
  }

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.suppliers.create(member, parseBody(supplierInput, body));
  }

  // Before ':ref', which would take "export" for a ref.
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="suppliers.csv"')
  export(@Member() member: CurrentMember) {
    return this.imports.export(member.organizationId);
  }

  /** What importing the file would do. Changes nothing. */
  @Post('import/preview')
  @HttpCode(200)
  @CsvUpload()
  previewImport(@Member() member: CurrentMember, @UploadedFile() upload?: Upload) {
    return this.imports.preview(member.organizationId, csvFile(upload));
  }

  @Post('import')
  @HttpCode(200)
  @CsvUpload()
  import(@Member() member: CurrentMember, @UploadedFile() upload?: Upload) {
    return this.imports.apply(member, csvFile(upload));
  }

  @Get(':ref')
  get(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.suppliers.get(member.organizationId, ref);
  }

  @Put(':ref')
  update(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.suppliers.update(member, ref, parseBody(supplierInput, body));
  }

  @Post(':ref/ending')
  end(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.suppliers.end(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/resumption')
  resume(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.suppliers.resume(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/deletion')
  @HttpCode(204)
  async delete(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    await this.suppliers.delete(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/reviews')
  @HttpCode(204)
  async addReview(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Body() body: unknown,
  ) {
    await this.suppliers.addReview(member, ref, parseBody(supplierReviewInput, body));
  }

  @Post(':ref/files')
  @HttpCode(204)
  async addFile(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    await this.suppliers.addFile(member, ref, parseBody(supplierFileInput, body));
  }

  @Delete(':ref/files/:id')
  @HttpCode(204)
  async removeFile(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.suppliers.removeFile(member, ref, id);
  }

  @Post(':ref/assets')
  @HttpCode(204)
  async linkAsset(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Body() body: unknown,
  ) {
    await this.suppliers.linkAsset(member, ref, parseBody(linkInput, body).id);
  }

  @Delete(':ref/assets/:id')
  @HttpCode(204)
  async unlinkAsset(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.suppliers.unlinkAsset(member, ref, id);
  }
}
