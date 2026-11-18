import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { before, PagingQuery } from '../common/pagination.js';
import { Note } from './note.schema.js';

type NoteInput = { title?: string; content?: string };

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private readonly notes: Model<Note>) {}

  listByOwner(owner: Types.ObjectId, { cursor, limit }: PagingQuery) {
    return this.notes
      .find({ owner, ...before(cursor) })
      .sort({ _id: -1 })
      .limit(limit + 1);
  }

  listAll({ cursor, limit }: PagingQuery) {
    return this.notes
      .find(before(cursor))
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('owner', 'name email');
  }

  findById(id: Types.ObjectId) {
    return this.notes.findById(id);
  }

  create(owner: Types.ObjectId, data: NoteInput) {
    return this.notes.create({ ...data, owner });
  }

  async update(id: Types.ObjectId, owner: Types.ObjectId, data: NoteInput) {
    const note = await this.notes.findOneAndUpdate({ _id: id, owner }, data, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async remove(id: Types.ObjectId, owner: Types.ObjectId) {
    const { deletedCount } = await this.notes.deleteOne({ _id: id, owner });
    if (!deletedCount) throw new NotFoundException('Note not found');
  }

  removeAllByOwner(owner: Types.ObjectId) {
    return this.notes.deleteMany({ owner });
  }
}
