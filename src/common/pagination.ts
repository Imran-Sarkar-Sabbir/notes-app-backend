import { Types } from 'mongoose';
import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'must be a valid id')
  .transform((id) => new Types.ObjectId(id));

export const pagingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: objectId.optional(),
});
export type PagingQuery = z.infer<typeof pagingQuery>;

export function toPage<T extends { _id: Types.ObjectId }>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? String(items[items.length - 1]._id) : null,
  };
}

export const before = (cursor?: Types.ObjectId) =>
  cursor ? { _id: { $lt: cursor } } : {};
