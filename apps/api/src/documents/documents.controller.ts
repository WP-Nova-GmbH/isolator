import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { documentFileInput, documentInput, DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(MemberGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    return this.documents.list(
      member.organizationId,
      state === 'withdrawn' ? 'withdrawn' : 'active',
    );
  }

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.documents.create(member, parseBody(documentInput, body));
  }

  @Get(':id')
  get(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(member.organizationId, id);
  }

  @Put(':id')
  update(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.documents.update(member, id, parseBody(documentInput, body));
  }

  @Put(':id/file')
  setFile(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.documents.setFile(member, id, parseBody(documentFileInput, body).storedFileId);
  }

  @Post(':id/versions')
  startVersion(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.startVersion(member, id);
  }

  @Post(':id/confirmations')
  confirm(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.confirm(member, id);
  }

  @Post(':id/withdrawal')
  withdraw(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.documents.withdraw(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/reinstatement')
  reinstate(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.documents.reinstate(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/deletion')
  @HttpCode(204)
  async delete(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    await this.documents.delete(member, id, parseBody(reasonInput, body).reason);
  }
}
