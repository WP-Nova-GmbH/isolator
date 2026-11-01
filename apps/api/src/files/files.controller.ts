import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { FilesService, MAX_FILE_BYTES, type Upload } from './files.service';

// Never rendered in the browser, whatever the file claims to be, so an upload can't run as a page.
function attachment(name: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller('files')
@UseGuards(MemberGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(@Member() member: CurrentMember, @UploadedFile() upload?: Upload) {
    if (!upload) throw new BadRequestException('Choose a file.');
    return this.files.store(member, upload);
  }

  @Get(':id')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    const { file, stream } = await this.files.open(member.organizationId, id);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      disposition: attachment(file.name),
      length: file.size,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    await this.files.removeUnlinked(member.organizationId, id);
  }
}
