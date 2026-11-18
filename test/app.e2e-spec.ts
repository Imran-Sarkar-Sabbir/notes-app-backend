import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { startInMemoryApp } from '../src/testing.js';
import { User } from '../src/users/user.schema.js';

let app: INestApplication;
let stop: () => Promise<void>;
let users: Model<User>;

const api = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(
  name: string,
  email: string,
  extra: Record<string, unknown> = {},
) {
  const res = await api()
    .post('/api/auth/register')
    .send({ name, email, password: 'password123', ...extra })
    .expect(201);
  return res.body as {
    token: string;
    user: { _id: string; role: string; password?: string };
  };
}

beforeAll(async () => {
  ({ app, stop } = await startInMemoryApp());
  users = app.get(getModelToken(User.name));
}, 120_000);

afterAll(async () => {
  await stop();
});

describe('auth', () => {
  it('register hashes the password and never returns it', async () => {
    const { token, user } = await register('Rahim', 'rahim@test.com', {
      role: 'admin',
    });
    expect(token).toBeTruthy();
    expect(user.role).toBe('user');
    expect(user.password).toBeUndefined();
    const stored = await users.findById(user._id).select('+password');
    expect(stored?.password).toMatch(/^\$2[aby]\$12\$/);
  });

  it('login works and wrong passwords are rejected', async () => {
    await api()
      .post('/api/auth/login')
      .send({ email: 'RAHIM@test.com', password: 'password123' })
      .expect(200);
    await api()
      .post('/api/auth/login')
      .send({ email: 'rahim@test.com', password: 'nope-nope' })
      .expect(401);
  });

  it('short passwords, bad emails and duplicate emails are refused', async () => {
    await api()
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@test.com', password: 'short' })
      .expect(400);
    await api()
      .post('/api/auth/register')
      .send({ name: 'X', email: 'not-an-email', password: 'password123' })
      .expect(400);
    await api()
      .post('/api/auth/register')
      .send({ name: 'X', email: 'rahim@test.com', password: 'password123' })
      .expect(409);
  });

  it('protected routes need a valid token', async () => {
    await api().get('/api/notes').expect(401);
    await api().get('/api/notes').set(as('garbage')).expect(401);
    await api().get('/api/health').expect(200);
  });
});

describe('notes and roles', () => {
  let alice: Awaited<ReturnType<typeof register>>;
  let bob: Awaited<ReturnType<typeof register>>;
  let admin: Awaited<ReturnType<typeof register>>;

  beforeAll(async () => {
    alice = await register('Alice', 'alice@test.com', {
      interests: ['Chess', 'reading'],
    });
    bob = await register('Bob', 'bob@test.com', { interests: ['chess'] });
    admin = await register('Admin', 'admin@test.com');
    await users.updateOne({ _id: admin.user._id }, { role: 'admin' });
  });

  it('users only see and change their own notes', async () => {
    const created = await api()
      .post('/api/notes')
      .set(as(alice.token))
      .send({ title: 'Alice note', content: 'hi' })
      .expect(201);
    const id = created.body._id;

    await api().get(`/api/notes/${id}`).set(as(bob.token)).expect(404);
    await api()
      .patch(`/api/notes/${id}`)
      .set(as(bob.token))
      .send({ title: 'hacked' })
      .expect(404);
    await api().delete(`/api/notes/${id}`).set(as(bob.token)).expect(404);
    expect(
      (await api().get('/api/notes').set(as(bob.token))).body.items,
    ).toHaveLength(0);

    const updated = await api()
      .patch(`/api/notes/${id}`)
      .set(as(alice.token))
      .send({ title: 'Edited' })
      .expect(200);
    expect(updated.body.title).toBe('Edited');
    await api().get('/api/notes/not-an-id').set(as(alice.token)).expect(400);
  });

  it('list pagination walks every note exactly once, newest first', async () => {
    for (let i = 0; i < 12; i++) {
      await api()
        .post('/api/notes')
        .set(as(bob.token))
        .send({ title: `Bob ${i}` });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: request.Response = await api()
        .get(`/api/notes?limit=5${cursor ? `&cursor=${cursor}` : ''}`)
        .set(as(bob.token))
        .expect(200);
      seen.push(...page.body.items.map((n: { title: string }) => n.title));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(seen[0]).toBe('Bob 11');
  });

  it('plain users cannot reach admin routes', async () => {
    await api().get('/api/users').set(as(alice.token)).expect(403);
    await api().get('/api/notes/all').set(as(alice.token)).expect(403);
    await api()
      .get('/api/users/grouped-by-interest')
      .set(as(alice.token))
      .expect(403);
  });

  it("admin can read everyone's notes but not edit them", async () => {
    const all = await api()
      .get('/api/notes/all?limit=50')
      .set(as(admin.token))
      .expect(200);
    expect(all.body.items).toHaveLength(13);
    expect(all.body.items[0].owner.name).toBeTruthy();

    const onlyAlice = await api()
      .get(`/api/notes/all?owner=${alice.user._id}`)
      .set(as(admin.token))
      .expect(200);
    expect(onlyAlice.body.items).toHaveLength(1);

    const aliceNote = onlyAlice.body.items[0]._id;
    await api().get(`/api/notes/${aliceNote}`).set(as(admin.token)).expect(200);
    await api()
      .patch(`/api/notes/${aliceNote}`)
      .set(as(admin.token))
      .send({ title: 'x' })
      .expect(404);
  });

  it('admin manages users', async () => {
    const created = await api()
      .post('/api/users')
      .set(as(admin.token))
      .send({
        name: 'Carol',
        email: 'carol@test.com',
        password: 'password123',
        interests: ['hiking'],
      })
      .expect(201);
    const carolId = created.body._id;

    const promoted = await api()
      .patch(`/api/users/${carolId}`)
      .set(as(admin.token))
      .send({ role: 'admin', password: 'newpassword1' })
      .expect(200);
    expect(promoted.body.role).toBe('admin');
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'carol@test.com', password: 'newpassword1' })
      .expect(200);

    const list = await api()
      .get('/api/users?limit=2')
      .set(as(admin.token))
      .expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.nextCursor).toBeTruthy();

    await api()
      .delete(`/api/users/${admin.user._id}`)
      .set(as(admin.token))
      .expect(400);
    await api()
      .delete(`/api/users/${carolId}`)
      .set(as(admin.token))
      .expect(204);
    await api().get(`/api/users/${carolId}`).set(as(admin.token)).expect(404);
    await api().get('/api/notes').set(as(login.body.token)).expect(401);
  });

  it('scenario 1: users grouped by interest', async () => {
    const all = await api()
      .get('/api/users/grouped-by-interest')
      .set(as(admin.token))
      .expect(200);
    const chess = all.body.groups.find(
      (g: { _id: string }) => g._id === 'chess',
    );
    expect(chess.count).toBe(2);
    expect(chess.users.map((u: { name: string }) => u.name).sort()).toEqual([
      'Alice',
      'Bob',
    ]);

    const filtered = await api()
      .get('/api/users/grouped-by-interest?interests=reading')
      .set(as(admin.token))
      .expect(200);
    expect(filtered.body.groups.map((g: { _id: string }) => g._id)).toEqual([
      'reading',
    ]);
    expect(filtered.body.totalGroups).toBe(1);
  });

  it("scenario 2: anyone can read a user's posts via $lookup", async () => {
    for (let i = 0; i < 3; i++) {
      await api()
        .post('/api/posts')
        .set(as(alice.token))
        .send({ title: `Post ${i}`, body: 'text' })
        .expect(201);
    }
    const page1 = await api()
      .get(`/api/users/${alice.user._id}/posts?limit=2`)
      .set(as(bob.token))
      .expect(200);
    expect(page1.body.user.name).toBe('Alice');
    expect(page1.body.items.map((p: { title: string }) => p.title)).toEqual([
      'Post 2',
      'Post 1',
    ]);

    const page2 = await api()
      .get(
        `/api/users/${alice.user._id}/posts?limit=2&cursor=${page1.body.nextCursor}`,
      )
      .set(as(bob.token))
      .expect(200);
    expect(page2.body.items.map((p: { title: string }) => p.title)).toEqual([
      'Post 0',
    ]);
    expect(page2.body.nextCursor).toBeNull();

    await api()
      .get(`/api/users/${new Types.ObjectId().toHexString()}/posts`)
      .set(as(bob.token))
      .expect(404);
  });

  it('scenario 2: post search filters by text, date and sort order', async () => {
    const titles = (res: request.Response) =>
      res.body.items.map((p: { title: string }) => p.title);
    const get = (query: string) =>
      api()
        .get(`/api/users/${alice.user._id}/posts?${query}`)
        .set(as(bob.token))
        .expect(200);

    expect(titles(await get('q=POST 1'))).toEqual(['Post 1']);
    expect(titles(await get('q=(.*)'))).toEqual([]);
    expect(titles(await get('sort=oldest'))).toEqual([
      'Post 0',
      'Post 1',
      'Post 2',
    ]);

    const oldest1 = await get('sort=oldest&limit=1');
    expect(
      titles(
        await get(`sort=oldest&limit=1&cursor=${oldest1.body.nextCursor}`),
      ),
    ).toEqual(['Post 1']);

    expect(titles(await get('since=day'))).toHaveLength(3);
    await api()
      .get(`/api/users/${alice.user._id}/posts?since=decade`)
      .set(as(bob.token))
      .expect(400);
  });
});
