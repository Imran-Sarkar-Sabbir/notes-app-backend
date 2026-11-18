import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from './post.schema.js';

@Injectable()
export class PostsService {
  constructor(@InjectModel(Post.name) private readonly posts: Model<Post>) {}

  get collectionName() {
    return this.posts.collection.name;
  }

  create(author: Types.ObjectId, data: { title: string; body: string }) {
    return this.posts.create({ ...data, author });
  }

  async remove(id: Types.ObjectId, author: Types.ObjectId) {
    const { deletedCount } = await this.posts.deleteOne({ _id: id, author });
    if (!deletedCount) throw new NotFoundException('Post not found');
  }

  removeAllByAuthor(author: Types.ObjectId) {
    return this.posts.deleteMany({ author });
  }
}
