# Notes API

REST API for a note-taking app with JWT auth and two roles (`user`, `admin`).
NestJS 12, MongoDB with Mongoose 9 (`@nestjs/mongoose`), `@nestjs/jwt`, bcrypt, Zod validation.

- Live API: `<add Render URL>`
- Frontend repo: `<add link>`

## Running it

Node 22 or newer.

```bash
npm install
cp .env.example .env        # fill in MONGODB_URI and JWT_SECRET
npm run build
npm run seed:admin          # creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run start:dev           # http://localhost:4000/api
```

No MongoDB handy? `npm run dev:memory` starts the API on an in-memory MongoDB with demo
accounts (`admin@demo.test` and `alice@demo.test`, password `password123`).

```bash
npm test                    # e2e tests (Vitest + supertest) against an in-memory MongoDB
npm run explain             # seeds data and prints the query plan of every query
```

## Structure

```
src/
  app.module.ts         config (validated with Zod), Mongo connection, feature modules
  app.setup.ts          /api prefix, CORS, validation pipe, Mongo error filter, index build
  auth/                 register/login/me, global AuthGuard + RolesGuard, @Public @Roles @CurrentUser
  users/                user schema, admin user management, both aggregation pipelines
  notes/                note schema and CRUD
  posts/                post schema, create/delete
  common/               pagination helpers, Mongo exception filter
  scripts/              explain, seed-admin, dev-memory
```

Auth is two global guards (`APP_GUARD`). `AuthGuard` checks the Bearer token on every route
unless it's marked `@Public()`, and loads the user. `RolesGuard` then checks `@Roles(['admin'])`
where a route has it. Request bodies, params and queries are validated with Zod schemas
through Nest's `StandardSchemaValidationPipe` (`@Body({ schema })`), and invalid input gets a 400.

## Roles

| | user | admin |
|---|---|---|
| Create, edit, delete, list own notes | yes | yes |
| Read everyone's notes | no | yes |
| Add, update, remove, list users | no | yes |
| Write posts, read anyone's posts | yes | yes |

Sign-up always creates a `user`. The register schema has no `role` field, so a role in the body is
dropped. Admins are made by another admin or by the seed script.

Admins can read other people's notes, but edits and deletes stay owner-only. The brief
says admins can *view* everyone's notes, so I kept write access with the owner.

## Endpoints

All under `/api`. Everything except register, login and health needs `Authorization: Bearer <token>`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{ name, email, password, interests[] }` |
| POST | `/auth/login` | public | `{ email, password }` returns `{ token, user }` |
| GET / PATCH | `/auth/me` | any | own profile, interests, password |
| GET | `/notes` | any | own notes, paged |
| POST | `/notes` | any | `{ title, content }` |
| GET | `/notes/:id` | owner or admin | |
| PATCH / DELETE | `/notes/:id` | owner | |
| GET | `/notes/all?owner=` | admin | everyone's notes, or one user's |
| GET / POST | `/users` | admin | list (paged) / create |
| GET / PATCH / DELETE | `/users/:id` | admin | deleting a user also deletes their notes and posts |
| GET | `/users/grouped-by-interest?interests=&page=` | admin | aggregation scenario 1 |
| GET | `/users/:id/posts` | any | aggregation scenario 2 (`$lookup`) |
| POST | `/posts` | any | `{ title, body }` |
| DELETE | `/posts/:id` | author | |

### Pagination

Lists use keyset (cursor) paging: `?limit=10&cursor=<id>`. The response is
`{ items, nextCursor }`, and you pass `nextCursor` back to get the next page.

I picked this over `skip`/`limit` because `skip` still walks every skipped index entry, so
page 500 costs far more than page 1. Here the next page is `_id < cursor`, a range on the
same index the list already uses, so every page costs the same. The query asks for
`limit + 1` rows to know whether there's another page, so there's no `countDocuments` call.

The interest groups are the exception and use `?page=`. Groups are computed by the
pipeline on each request, so there's no stored `_id` to keep a cursor on.

## Indexes

All indexes are declared with `schema.index()` right after `SchemaFactory.createForClass()`
in the `*.schema.ts` files. Besides the default `_id` index there are four:

| Collection | Index | Used by |
|---|---|---|
| users | `{ email: 1 }` unique | login lookup, and blocks duplicate emails |
| users | `{ interests: 1 }` | the `$match` in scenario 1 when filtering by interest |
| notes | `{ owner: 1, _id: -1 }` | a user's notes, newest first, paged. Also admin "notes of user X" and cleanup when a user is deleted |
| posts | `{ author: 1, _id: -1 }` | `foreignField` of the `$lookup` in scenario 2, plus its sort and paging |

Indexes I chose not to add:

- **`createdAt`**: lists sort by `_id` instead. An ObjectId starts with its creation
  timestamp, so `_id: -1` gives newest first, and the `_id` index already exists.
- **Admin user list / all notes**: sorted and paged on `_id` only, so the default index covers them.
- **Single-document reads** (`GET /users/:id`, `GET /notes/:id`) and note update/delete
  use `_id`. Update and delete also filter on `owner`, but `_id` alone narrows it to one document.
- **A separate `{ owner: 1 }`**: the compound index has `owner` as its prefix, so it
  already serves anything that filters on owner alone. Same for `author`.
- **`role`**: nothing queries by role.

### Proof

The services' read methods return the Mongoose query or aggregate before it runs, so
`npm run explain` calls `.explain()` on exactly what the API runs. It loads 2000 users, 20000
notes and 6000 posts first:

```
query                              plan              indexes                              docs  keys
login: user by email               EXPRESS_IXSCAN    email_1                              1     1
GET user by id                     EXPRESS_IXSCAN    _id_                                 1     1
admin: list users, page 1          FETCH > IXSCAN    _id_                                 11    11
admin: list users, next page       FETCH > IXSCAN    _id_                                 11    11
my notes, page 1                   FETCH > IXSCAN    owner_1__id_-1                       10    10
my notes, next page                FETCH > IXSCAN    owner_1__id_-1                       10    10
GET note by id                     EXPRESS_IXSCAN    _id_                                 1     1
admin: all notes                   FETCH > IXSCAN    _id_                                 11    11
scenario 1: grouped, filtered      FETCH > IXSCAN    interests_1                          591   591
scenario 1: grouped, everyone      COLLSCAN          (none)                               2000  0
scenario 2: user posts ($lookup)   EXPRESS_IXSCAN    _id_, author_1__id_-1 (in $lookup)   4     1
```

None of the plans has a `SORT` stage, so every sort comes from index order and nothing is
sorted in memory.

The one `COLLSCAN` is scenario 1 with no filter. Grouping *every* user by interest has to
read every user, and an index can't change that. A multikey index can't cover the query
either, because covered queries don't work on array fields. So `{ interests: 1 }` is
there for the filtered view (`?interests=chess,reading`), which reads only matching users.

## Aggregations

Both are in `src/users/users.service.ts`.

**Scenario 1, users grouped by interest** (`groupedByInterest`). One `aggregate()` call:
`$match` (optional, uses the index) → `$project` → `$unwind interests` →
`$match` again (a matched user has other interests too, so drop those) → `$group` by
interest with a count and the users → `$sort` → `$facet` returning the page of groups and
the total count. Doing the count in `$facet` keeps it to the single call the brief asks for.
Interests are trimmed, lowercased and de-duplicated on save, so "Chess" and "chess " group together.

**Scenario 2, a user's posts** (`withPosts`). One pipeline on `users`: `$match` the user by `_id`,
then `$lookup` into `posts` with `localField: _id` / `foreignField: author` and an inner pipeline
that sorts by `_id` descending and limits. This is the MongoDB 5.0+ concise form, which
allows `localField`/`foreignField` and an inner `pipeline` together. Explain shows the inner
lookup using `author_1__id_-1`. A missing user returns 404 instead of an empty list.
Mongoose doesn't cast aggregation input, so ids are turned into `ObjectId` by the Zod param schema first.

## Security notes

- Passwords are hashed with bcrypt (cost 12) in a `pre('save')` hook on the schema. User
  updates go through `save()` rather than `findByIdAndUpdate`, so a changed password is always hashed.
- Password is `select: false` and is removed in `toJSON`, so it never leaves the API.
- Login returns the same error for an unknown email and a wrong password.
- JWTs are HS256, verified with `algorithms: ['HS256']`, and the secret must be at least 32
  characters (checked at startup). The user is reloaded on each request (an `_id` lookup), so a
  deleted user or a changed role takes effect immediately, not when the token expires.
- Someone else's note returns 404, not 403, so the API doesn't confirm that the note exists.

Not done, given the scope: rate limiting on login (`@nestjs/throttler` would be the next step), refresh tokens.

## Deploying (Render)

New Web Service from this repo: build `npm install && npm run build`, start `npm run start:prod`.
Environment variables: `MONGODB_URI` (Atlas free cluster), `JWT_SECRET`, `CLIENT_ORIGIN` (the
deployed frontend URL; comma-separate several), and `NODE_VERSION=22`. Then run `npm run seed:admin`
once locally against the same `MONGODB_URI`. In Atlas, allow access from `0.0.0.0/0` because
Render's outgoing IPs aren't fixed on the free tier.
