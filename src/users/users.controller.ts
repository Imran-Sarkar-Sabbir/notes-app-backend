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
import { ROLES, type UserDocument } from './user.schema.js';
import { UsersService } from './users.service.js';

const createUserBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
  role: z.enum(ROLES).optional(),
  interests: z.array(z.string()).optional(),
});
const updateUserBody = createUserBody.partial();

const postsQuery = pagingQuery.extend({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((s) => s || undefined),
  since: z.enum(['day', 'week', 'month', 'year']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

const groupedQuery = z.object({
  interests: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? '')
        .split(',')
        .map((i) => i.trim().toLowerCase())
        .filter(Boolean),
    ),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id/posts')
  async posts(
    @Param('id', { schema: objectId }) id: Types.ObjectId,
    @Query({ schema: postsQuery }) q: z.infer<typeof postsQuery>,
  ) {
    const [user] = await this.users.withPosts(id, q);
    if (!user) throw new NotFoundException('User not found');
    return {
      user: { _id: user._id, name: user.name },
      ...toPage(user.posts, q.limit),
    };
  }

  @Get('grouped-by-interest')
  @Roles(['admin'])
  async grouped(
    @Query({ schema: groupedQuery }) q: z.infer<typeof groupedQuery>,
  ) {
    const [result] = await this.users.groupedByInterest(q);
    return {
      page: q.page,
      limit: q.limit,
      totalGroups: result.meta[0]?.totalGroups ?? 0,
      groups: result.groups,
    };
  }

  @Get()
  @Roles(['admin'])
  async list(@Query({ schema: pagingQuery }) q: PagingQuery) {
    return toPage(await this.users.list(q), q.limit);
  }

  @Post()
  @Roles(['admin'])
  create(
    @Body({ schema: createUserBody }) body: z.infer<typeof createUserBody>,
  ) {
    return this.users.create(body);
  }

  @Get(':id')
  @Roles(['admin'])
  async one(@Param('id', { schema: objectId }) id: Types.ObjectId) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Patch(':id')
  @Roles(['admin'])
  update(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
    @Body({ schema: updateUserBody }) body: z.infer<typeof updateUserBody>,
  ) {
    return this.users.update(id, body, me);
  }

  @Delete(':id')
  @Roles(['admin'])
  @HttpCode(204)
  remove(
    @CurrentUser() me: UserDocument,
    @Param('id', { schema: objectId }) id: Types.ObjectId,
  ) {
    return this.users.remove(id, me);
  }
}
