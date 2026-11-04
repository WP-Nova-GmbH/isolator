import {
  Body,
  Controller,
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
import type { Upload } from '../files/files.service';
import { csvFile, CsvUpload } from '../imports/register-import';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { AssetImportService } from './asset-import.service';
import { assetInput, AssetsService } from './assets.service';

@Controller('assets')
@UseGuards(MemberGuard)
export class AssetsController {
  constructor(
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(AssetImportService) private readonly imports: AssetImportService,
  ) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    return this.assets.list(member.organizationId, state === 'retired' ? 'retired' : 'active');
  }

  // Before ':id', which would take "export" for an id.
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="assets.csv"')
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

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.assets.create(member, parseBody(assetInput, body));
  }

  @Get(':id')
  get(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(member.organizationId, id);
  }

  @Put(':id')
  update(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.update(member, id, parseBody(assetInput, body));
  }

  @Post(':id/retirement')
  retire(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.retire(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/reinstatement')
  reinstate(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.reinstate(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/deletion')
  @HttpCode(204)
  async delete(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    await this.assets.delete(member, id, parseBody(reasonInput, body).reason);
  }
}
