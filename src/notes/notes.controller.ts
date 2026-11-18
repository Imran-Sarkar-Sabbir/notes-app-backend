import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators.js';
import {
  objectId,
  pagingQuery,
  toPage,
  type PagingQuery,
} from '../common/pagination.js';
import type { UserDocument } from '../users/user.schema.js';
import { NotesService } from './notes.service.js';

const noteBody = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(20000).optional(),
});
const notePatch = noteBody.partial();
const allNotesQuery = pagingQuery.extend({ owner: objectId.optional() });

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  async mine(
    @CurrentUser() me: UserDocument,
    @Query({ schema: pagingQuery }) q: PagingQuery,
  ) {
    return toPage(await this.notes.listByOwner(me._id, q), q.limit);
  }

  @Get('all')
  @Roles(['admin'])
  async all(
    @Query({ schema: allNotesQuery }) q: z.infer<typeof allNotesQuery>,
  ) {
    const rows = q.owner
      ? await this.notes.listByOwner(q.owner, q)
      : await this.notes.listAll(q);
    return toPage(rows, q.limit);
  }

  @Get(':id')
  async one(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
  ) {
    const note = await this.notes.findById(id);
    if (!note || !(note.owner.equals(me._id) || me.role === 'admin')) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }

  @Post()
  create(
    @CurrentUser() me: UserDocument,
    @Body({ schema: noteBody }) body: z.infer<typeof noteBody>,
  ) {
    return this.notes.create(me._id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
    @Body({ schema: notePatch }) body: z.infer<typeof notePatch>,
  ) {
    return this.notes.update(id, me._id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
  ) {
    return this.notes.remove(id, me._id);
  }
}
