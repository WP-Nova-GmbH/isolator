import {
  Body,
  Controller,
  Get,
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
import { taskInput, TasksService, taskStateInput } from './tasks.service';

@Controller('tasks')
@UseGuards(MemberGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Get()
  list(
    @Member() member: CurrentMember,
    @Query('risk') riskRef?: string,
    @Query('supplier') supplierRef?: string,
    @Query('incident') incidentRef?: string,
    @Query('soa') soaRef?: string,
  ) {
    return this.tasks.list(member.organizationId, { riskRef, supplierRef, incidentRef, soaRef });
  }

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.tasks.create(member, parseBody(taskInput, body));
  }

  @Post(':id/cancellation')
  cancel(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.tasks.cancel(member, id, parseBody(reasonInput, body).reason);
  }

  @Put(':id/state')
  setState(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.tasks.setDone(member, id, parseBody(taskStateInput, body).done);
  }
}
