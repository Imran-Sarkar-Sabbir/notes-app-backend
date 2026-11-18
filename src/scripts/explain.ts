import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Note } from '../notes/note.schema.js';
import { NotesService } from '../notes/notes.service.js';
import { Post } from '../posts/post.schema.js';
import { startInMemoryApp } from '../testing.js';
import { User } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';

const USERS = 2000;
const INTERESTS = [
  'chess',
  'reading',
  'hiking',
  'music',
  'coding',
  'cooking',
  'travel',
  'football',
];

const { app, stop } = await startInMemoryApp();
const userModel = app.get<Model<User>>(getModelToken(User.name));
const noteModel = app.get<Model<Note>>(getModelToken(Note.name));
const postModel = app.get<Model<Post>>(getModelToken(Post.name));
const users = app.get(UsersService);
const notes = app.get(NotesService);

const seeded = await userModel.insertMany(
  Array.from({ length: USERS }, (_, i) => ({
    name: `User ${i}`,
    email: `user${i}@example.com`,
    password: 'seed-only-not-hashed',
    interests: INTERESTS.filter(() => Math.random() < 0.3),
  })),
);
const ids = seeded.map((u) => u._id);
await noteModel.insertMany(
  Array.from({ length: 20000 }, (_, i) => ({
    owner: ids[i % USERS],
    title: `Note ${i}`,
  })),
);
await postModel.insertMany(
  Array.from({ length: 6000 }, (_, i) => ({
    author: ids[i % USERS],
    title: `Post ${i}`,
    body: 'x',
  })),
);

const someone = ids[42];
const someNote = (await noteModel.findOne({ owner: someone }))!._id;

function summarise(plan: unknown) {
  const stages = new Set<string>();
  const indexes = new Set<string>();
  let docs = 0;
  let keys = 0;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as Record<string, any>;
    if (typeof n.stage === 'string') stages.add(n.stage);
    if (n.indexName) indexes.add(n.indexName);
    if (Array.isArray(n.indexesUsed))
      n.indexesUsed.forEach((i: string) => indexes.add(`${i} (in $lookup)`));
    if (n.executionStats) {
      docs += n.executionStats.totalDocsExamined ?? 0;
      keys += n.executionStats.totalKeysExamined ?? 0;
    }
    if (typeof n.totalDocsExamined === 'number' && n.indexesUsed)
      docs += n.totalDocsExamined;
    for (const [k, v] of Object.entries(n)) if (k !== 'rejectedPlans') walk(v);
  };
  walk(plan);
  const shown = [
    'COLLSCAN',
    'IXSCAN',
    'FETCH',
    'SORT',
    'IDHACK',
    'EXPRESS_IXSCAN',
  ];
  return {
    plan: [...stages].filter((s) => shown.includes(s)).join(' > '),
    indexes: [...indexes].join(', ') || '(none)',
    docsExamined: docs,
    keysExamined: keys,
  };
}

const page = { limit: 10 };
const checks: Record<
  string,
  { explain: (v: 'executionStats') => Promise<unknown> }
> = {
  'login: user by email': users.findForLogin('user77@example.com'),
  'GET user by id': users.findById(someone),
  'admin: list users, page 1': users.list(page),
  'admin: list users, next page': users.list({ ...page, cursor: ids[1500] }),
  'my notes, page 1': notes.listByOwner(someone, page),
  'my notes, next page': notes.listByOwner(someone, {
    ...page,
    cursor: new Types.ObjectId(),
  }),
  'GET note by id': notes.findById(someNote),
  'admin: all notes': notes.listAll(page),
  'scenario 1: grouped, filtered': users.groupedByInterest({
    interests: ['chess'],
  }),
  'scenario 1: grouped, everyone': users.groupedByInterest({}),
  'scenario 2: user posts ($lookup)': users.withPosts(someone, page),
  'scenario 2: search, past week, oldest': users.withPosts(someone, {
    ...page,
    q: 'post 4',
    since: 'week',
    sort: 'oldest',
  }),
};

const rows = [];
for (const [query, q] of Object.entries(checks)) {
  rows.push({ query, ...summarise(await q.explain('executionStats')) });
}
console.log(`\n${USERS} users, 20000 notes, 6000 posts\n`);
console.table(rows);
await stop();
