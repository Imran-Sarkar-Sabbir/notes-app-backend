import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { z } from 'zod';
import { objectId } from '../common/pagination.js';
import { CurrentUser } from '../auth/decorators.js';
import type { UserDocument } from '../users/user.schema.js';
import { PostsService } from './posts.service.js';

const createPostBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(20000),
});

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(
    @CurrentUser() me: UserDocument,
    @Body({ schema: createPostBody }) body: z.infer<typeof createPostBody>,
  ) {
    return this.posts.create(me._id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
  ) {
    return this.posts.remove(id, me._id);
  }
}
