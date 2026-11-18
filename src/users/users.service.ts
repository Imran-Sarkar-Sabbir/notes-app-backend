import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { before, PagingQuery } from '../common/pagination.js';
import { NotesService } from '../notes/notes.service.js';
import { PostsService } from '../posts/posts.service.js';
import { Role, User, UserDocument } from './user.schema.js';

const DAY = 24 * 60 * 60 * 1000;
export const SINCE_MS = {
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  year: 365 * DAY,
};
export type PostSearch = PagingQuery & {
  q?: string;
  since?: keyof typeof SINCE_MS;
  sort?: 'newest' | 'oldest';
};

export type UserInput = Partial<
  Pick<User, 'name' | 'email' | 'password' | 'role' | 'interests'>
>;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notes: NotesService,
    private readonly posts: PostsService,
  ) {}

  findForLogin(email: string) {
    return this.users
      .findOne({ email: email.trim().toLowerCase() })
      .select('+password');
  }

  findById(id: Types.ObjectId | string) {
    return this.users.findById(id);
  }

  list({ cursor, limit }: PagingQuery) {
    return this.users
      .find(before(cursor))
      .sort({ _id: -1 })
      .limit(limit + 1);
  }

  create(data: UserInput & { role?: Role }) {
    return this.users.create(data);
  }

  async update(id: Types.ObjectId, data: UserInput, actor?: UserDocument) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (
      actor &&
      user._id.equals(actor._id) &&
      data.role &&
      data.role !== 'admin'
    ) {
      throw new BadRequestException("You can't remove your own admin role");
    }
    user.set(data);
    return user.save();
  }

  async remove(id: Types.ObjectId, actor: UserDocument) {
    if (id.equals(actor._id))
      throw new BadRequestException("You can't delete your own account here");
    const { deletedCount } = await this.users.deleteOne({ _id: id });
    if (!deletedCount) throw new NotFoundException('User not found');
    await Promise.all([
      this.notes.removeAllByOwner(id),
      this.posts.removeAllByAuthor(id),
    ]);
  }

  groupedByInterest({
    interests = [],
    page = 1,
    limit = 10,
  }: {
    interests?: string[];
    page?: number;
    limit?: number;
  }) {
    const filter: PipelineStage[] = interests.length
      ? [{ $match: { interests: { $in: interests } } }]
      : [];
    return this.users.aggregate<{
      meta: { totalGroups: number }[];
      groups: unknown[];
    }>([
      ...filter,
      { $project: { name: 1, email: 1, interests: 1 } },
      { $unwind: '$interests' },
      ...filter,
      {
        $group: {
          _id: '$interests',
          count: { $sum: 1 },
          users: { $push: { _id: '$_id', name: '$name', email: '$email' } },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      {
        $facet: {
          meta: [{ $count: 'totalGroups' }],
          groups: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]);
  }

  withPosts(
    userId: Types.ObjectId,
    { cursor, limit, q, since, sort = 'newest' }: PostSearch,
  ) {
    const dir = sort === 'oldest' ? 1 : -1;
    const idRange = {
      ...(since
        ? {
            $gte: Types.ObjectId.createFromTime(
              Math.floor((Date.now() - SINCE_MS[since]) / 1000),
            ),
          }
        : {}),
      ...(cursor ? { [dir === 1 ? '$gt' : '$lt']: cursor } : {}),
    };
    const text = q
      ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null;
    const match = {
      ...(Object.keys(idRange).length ? { _id: idRange } : {}),
      ...(text ? { $or: [{ title: text }, { body: text }] } : {}),
    };

    return this.users.aggregate<{
      _id: Types.ObjectId;
      name: string;
      posts: { _id: Types.ObjectId }[];
    }>([
      { $match: { _id: userId } },
      { $project: { name: 1 } },
      {
        $lookup: {
          from: this.posts.collectionName,
          localField: '_id',
          foreignField: 'author',
          pipeline: [
            ...(Object.keys(match).length ? [{ $match: match }] : []),
            { $sort: { _id: dir } },
            { $limit: limit + 1 },
            { $project: { title: 1, body: 1, createdAt: 1 } },
          ],
          as: 'posts',
        },
      },
    ]);
  }
}
